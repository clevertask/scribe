import { spawnSync } from "node:child_process";
import { access, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const consumerDirectory = resolve(repositoryDirectory, "e2e/consumer");
const consumerManifestPath = resolve(consumerDirectory, "package.json");
const consumerNodeModules = resolve(consumerDirectory, "node_modules");
const packageTarballPath = resolve(consumerDirectory, "package-under-test.tgz");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function run(command, args, { captureOutput = false, cwd = repositoryDirectory } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: captureOutput ? "pipe" : "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    if (captureOutput) {
      process.stderr.write(result.stderr);
    }

    throw new Error(`${command} ${args.join(" ")} exited with status ${result.status}`);
  }

  return result.stdout?.trim() ?? "";
}

const [
  packageManifest,
  radixThemesManifest,
  reactManifest,
  reactDomManifest,
  viteManifest,
  viteReactPluginManifest,
] = await Promise.all([
  readJson(resolve(repositoryDirectory, "package.json")),
  readJson(resolve(repositoryDirectory, "node_modules/@radix-ui/themes/package.json")),
  readJson(resolve(repositoryDirectory, "node_modules/react/package.json")),
  readJson(resolve(repositoryDirectory, "node_modules/react-dom/package.json")),
  readJson(resolve(repositoryDirectory, "node_modules/vite/package.json")),
  readJson(resolve(repositoryDirectory, "node_modules/@vitejs/plugin-react/package.json")),
]);

const consumerManifest = {
  name: "scribe-package-consumer",
  version: "0.0.0",
  private: true,
  type: "module",
  packageManager: packageManifest.packageManager,
  dependencies: {
    "@clevertask/scribe": "file:./package-under-test.tgz",
    "@radix-ui/themes": radixThemesManifest.version,
    react: reactManifest.version,
    "react-dom": reactDomManifest.version,
  },
  devDependencies: {
    "@vitejs/plugin-react": viteReactPluginManifest.version,
    vite: viteManifest.version,
  },
};

await rm(consumerNodeModules, { force: true, recursive: true });
await rm(packageTarballPath, { force: true });
await writeFile(consumerManifestPath, `${JSON.stringify(consumerManifest, null, 2)}\n`);

const storeDirectory = run(pnpmCommand, ["store", "path"], {
  captureOutput: true,
});

if (storeDirectory.length === 0) {
  throw new Error("pnpm did not return a package store path");
}

run(pnpmCommand, ["pack", "--out", packageTarballPath]);

try {
  run(pnpmCommand, [
    "install",
    "--dir",
    consumerDirectory,
    "--ignore-workspace",
    "--no-lockfile",
    "--prefer-offline",
    "--ignore-scripts",
    "--strict-peer-dependencies",
    "--store-dir",
    storeDirectory,
  ]);
} finally {
  await rm(packageTarballPath, { force: true });
}

const installedPackageDirectory = resolve(consumerNodeModules, "@clevertask/scribe");
const installedManifest = await readJson(resolve(installedPackageDirectory, "package.json"));

if (
  installedManifest.name !== packageManifest.name ||
  installedManifest.version !== packageManifest.version
) {
  throw new Error(
    `Installed ${installedManifest.name}@${installedManifest.version} instead of ${packageManifest.name}@${packageManifest.version}`,
  );
}

const installedPackagePath = await realpath(installedPackageDirectory);
const installedPackageRelativePath = relative(consumerNodeModules, installedPackagePath);

if (
  installedPackageRelativePath === "" ||
  installedPackageRelativePath === ".." ||
  installedPackageRelativePath.startsWith(`..${sep}`)
) {
  throw new Error("The package consumer resolved the library outside its own node_modules");
}

const rootExport = installedManifest.exports?.["."];
const packageEntry = rootExport?.default;
const packageTypes = rootExport?.types;
const stylesheetEntry = installedManifest.exports?.["./styles.css"];
const legacyStylesheetEntry = installedManifest.exports?.["./dist/main.css"];

if (
  typeof packageEntry !== "string" ||
  typeof packageTypes !== "string" ||
  typeof stylesheetEntry !== "string" ||
  typeof legacyStylesheetEntry !== "string"
) {
  throw new Error("The installed package does not declare its expected public exports");
}

if (installedManifest.main !== packageEntry || installedManifest.types !== packageTypes) {
  throw new Error("The installed package entry fields do not match its root export");
}

await Promise.all(
  [packageEntry, packageTypes, stylesheetEntry, legacyStylesheetEntry].map((entry) =>
    access(resolve(installedPackageDirectory, entry)),
  ),
);

console.log(
  `Prepared ${installedManifest.name}@${installedManifest.version} from ${installedPackageRelativePath}`,
);
