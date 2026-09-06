import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageManifestPath = resolve(repositoryDirectory, "package.json");
const managedDependencyFields = ["dependencies", "devDependencies"];
const tiptapPackagePrefix = "@tiptap/";
const tiptapPmPackage = "@tiptap/pm";
const exactSemverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*))(?:\.(?:(?:0|[1-9]\d*)|(?:\d*[A-Za-z-][0-9A-Za-z-]*)))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireRecord(value, label) {
  if (!isRecord(value)) {
    throw new Error(`${label} must be an object`);
  }

  return value;
}

function requireExactVersion(version, label) {
  if (typeof version !== "string" || !exactSemverPattern.test(version)) {
    throw new Error(`${label} must be an exact semantic version; found ${JSON.stringify(version)}`);
  }

  return version;
}

function collectTiptapEntries(manifest) {
  const entries = [];
  const packageFields = new Map();

  for (const field of managedDependencyFields) {
    const dependencies = requireRecord(manifest[field], field);

    for (const [name, version] of Object.entries(dependencies)) {
      if (!name.startsWith(tiptapPackagePrefix)) {
        continue;
      }

      const previousField = packageFields.get(name);

      if (previousField !== undefined) {
        throw new Error(
          `${name} must be declared once; found it in both ${previousField} and ${field}`,
        );
      }

      packageFields.set(name, field);
      entries.push({ field, name, version });
    }
  }

  return entries;
}

export function inspectTiptapContract(manifest, { allowPeerMismatch = false } = {}) {
  requireRecord(manifest, "package manifest");

  const devDependencies = requireRecord(manifest.devDependencies, "devDependencies");
  const canonicalVersion = requireExactVersion(
    devDependencies[tiptapPmPackage],
    `devDependencies[${JSON.stringify(tiptapPmPackage)}]`,
  );
  const entries = collectTiptapEntries(manifest);

  if (entries.length === 0) {
    throw new Error("dependencies and devDependencies must declare at least one Tiptap package");
  }

  const mismatches = entries
    .filter(({ version }) => version !== canonicalVersion)
    .map(
      ({ field, name, version }) => `${field}[${JSON.stringify(name)}]=${JSON.stringify(version)}`,
    )
    .sort();

  if (mismatches.length > 0) {
    throw new Error(
      `Every Tiptap dependency must equal exact ${canonicalVersion}; found ${mismatches.join(", ")}`,
    );
  }

  const peerDependencies = requireRecord(manifest.peerDependencies, "peerDependencies");
  const peerVersion = requireExactVersion(
    peerDependencies[tiptapPmPackage],
    `peerDependencies[${JSON.stringify(tiptapPmPackage)}]`,
  );
  if (!allowPeerMismatch && peerVersion !== canonicalVersion) {
    throw new Error(
      `peerDependencies[${JSON.stringify(tiptapPmPackage)}] must equal exact ${canonicalVersion}; found ${JSON.stringify(peerVersion)}`,
    );
  }

  return {
    canonicalVersion,
    peerVersion,
    tiptapPackageCount: entries.length,
  };
}

function parseManifestSource(source) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`package.json must contain valid JSON: ${error.message}`, { cause: error });
  }
}

function serializeManifest(manifest, source) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const hasLineBreak = /\r?\n/.test(source);
  const indentation = hasLineBreak ? (source.match(/\r?\n([ \t]+)"/)?.[1] ?? "  ") : undefined;
  const hasFinalNewline = /\r?\n$/.test(source);
  let updatedSource = JSON.stringify(manifest, null, indentation);

  if (newline === "\r\n") {
    updatedSource = updatedSource.replaceAll("\n", "\r\n");
  }

  if (hasFinalNewline) {
    updatedSource += newline;
  }

  return updatedSource;
}

export function checkTiptapContractSource(source) {
  return inspectTiptapContract(parseManifestSource(source));
}

export function synchronizeTiptapContractSource(source) {
  const manifest = parseManifestSource(source);
  const contract = inspectTiptapContract(manifest, { allowPeerMismatch: true });

  if (contract.peerVersion === contract.canonicalVersion) {
    return { ...contract, changed: false, source };
  }

  manifest.peerDependencies[tiptapPmPackage] = contract.canonicalVersion;
  inspectTiptapContract(manifest);

  return {
    ...contract,
    changed: true,
    source: serializeManifest(manifest, source),
  };
}

async function run(command) {
  const source = await readFile(packageManifestPath, "utf8");

  if (command === "--check") {
    const contract = checkTiptapContractSource(source);
    console.log(
      `Tiptap contract is aligned at ${contract.canonicalVersion} across ${contract.tiptapPackageCount} package entries.`,
    );
    return;
  }

  if (command === "--write") {
    const result = synchronizeTiptapContractSource(source);

    if (result.changed) {
      await writeFile(packageManifestPath, result.source, "utf8");
      console.log(
        `Synchronized the exact ${tiptapPmPackage} peer from ${result.peerVersion} to ${result.canonicalVersion}.`,
      );
    } else {
      console.log(
        `Tiptap contract is already aligned at ${result.canonicalVersion} across ${result.tiptapPackageCount} package entries.`,
      );
    }

    return;
  }

  throw new Error("Usage: node scripts/sync-tiptap-contract.mjs --check|--write");
}

const isDirectExecution =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  run(process.argv.length === 3 ? process.argv[2] : undefined).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
