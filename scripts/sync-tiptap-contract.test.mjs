import assert from "node:assert/strict";
import test from "node:test";

import {
  checkTiptapContractSource,
  inspectTiptapContract,
  synchronizeTiptapContractSource,
} from "./sync-tiptap-contract.mjs";

function createManifest() {
  return {
    name: "@clevertask/scribe",
    version: "0.1.20",
    scripts: {
      test: "vitest run",
    },
    dependencies: {
      "@tiptap/core": "3.30.5",
      "@tiptap/react": "3.30.5",
      clsx: "^2.1.1",
    },
    devDependencies: {
      "@tiptap/extension-bold": "3.30.5",
      "@tiptap/pm": "3.30.5",
      vitest: "^4.1.11",
    },
    peerDependencies: {
      "@tiptap/pm": "3.30.5",
      react: ">=18.3.1 <20.0.0",
    },
    packageManager: "pnpm@11.17.0",
  };
}

function createSource(manifest = createManifest()) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

test("accepts one exact Tiptap family and exact PM peer", () => {
  assert.deepEqual(inspectTiptapContract(createManifest()), {
    canonicalVersion: "3.30.5",
    peerVersion: "3.30.5",
    tiptapPackageCount: 4,
  });
});

test("updates only a stale exact PM peer while preserving package formatting", () => {
  const manifest = createManifest();
  manifest.peerDependencies["@tiptap/pm"] = "3.30.4";
  const source = `${JSON.stringify(manifest, null, "\t").replaceAll("\n", "\r\n")}\r\n`;
  const result = synchronizeTiptapContractSource(source);
  const expectedSource = source.replace(
    '\t\t"@tiptap/pm": "3.30.4",',
    '\t\t"@tiptap/pm": "3.30.5",',
  );

  assert.equal(result.changed, true);
  assert.equal(result.peerVersion, "3.30.4");
  assert.equal(result.canonicalVersion, "3.30.5");
  assert.equal(result.source, expectedSource);
  assert.doesNotThrow(() => checkTiptapContractSource(result.source));
});

test("reports a stale exact PM peer in read-only check mode", () => {
  const manifest = createManifest();
  manifest.peerDependencies["@tiptap/pm"] = "3.30.4";

  assert.throws(
    () => checkTiptapContractSource(createSource(manifest)),
    /peerDependencies\["@tiptap\/pm"\] must equal exact 3\.30\.5.*3\.30\.4/,
  );
});

test("leaves an aligned package byte-for-byte unchanged", () => {
  const source = JSON.stringify(createManifest());
  const result = synchronizeTiptapContractSource(source);

  assert.equal(result.changed, false);
  assert.equal(result.source, source);
});

test("rejects a mixed Tiptap dependency family before changing the peer", () => {
  const manifest = createManifest();
  manifest.dependencies["@tiptap/react"] = "3.31.0";
  manifest.peerDependencies["@tiptap/pm"] = "3.30.4";

  assert.throws(
    () => synchronizeTiptapContractSource(createSource(manifest)),
    /Every Tiptap dependency must equal exact 3\.30\.5.*@tiptap\/react.*3\.31\.0/,
  );
});

test("rejects a newly introduced mismatched Tiptap package", () => {
  const manifest = createManifest();
  manifest.devDependencies["@tiptap/extension-underline"] = "3.31.0";

  assert.throws(
    () => checkTiptapContractSource(createSource(manifest)),
    /@tiptap\/extension-underline.*3\.31\.0/,
  );
});

test("rejects non-exact canonical PM versions", () => {
  for (const version of ["^3.30.5", "~3.30.5", "workspace:*", "latest", "03.30.5"]) {
    const manifest = createManifest();
    manifest.devDependencies["@tiptap/pm"] = version;

    assert.throws(
      () => inspectTiptapContract(manifest),
      /devDependencies\["@tiptap\/pm"\] must be an exact semantic version/,
    );
  }
});

test("rejects a non-exact peer even in synchronization mode", () => {
  for (const version of ["^3.30.4", "workspace:^", "latest"]) {
    const manifest = createManifest();
    manifest.peerDependencies["@tiptap/pm"] = version;

    assert.throws(
      () => synchronizeTiptapContractSource(createSource(manifest)),
      /peerDependencies\["@tiptap\/pm"\] must be an exact semantic version/,
    );
  }
});

test("rejects missing PM declarations", () => {
  const missingDevelopmentPm = createManifest();
  delete missingDevelopmentPm.devDependencies["@tiptap/pm"];
  assert.throws(
    () => inspectTiptapContract(missingDevelopmentPm),
    /devDependencies\["@tiptap\/pm"\] must be an exact semantic version/,
  );

  const missingPeerPm = createManifest();
  delete missingPeerPm.peerDependencies["@tiptap/pm"];
  assert.throws(
    () => inspectTiptapContract(missingPeerPm),
    /peerDependencies\["@tiptap\/pm"\] must be an exact semantic version/,
  );
});

test("rejects duplicate Tiptap declarations", () => {
  const duplicate = createManifest();
  duplicate.devDependencies["@tiptap/core"] = "3.30.5";
  assert.throws(() => inspectTiptapContract(duplicate), /@tiptap\/core must be declared once/);
});

test("accepts exact prerelease versions", () => {
  const manifest = createManifest();

  for (const field of ["dependencies", "devDependencies"]) {
    for (const name of Object.keys(manifest[field])) {
      if (name.startsWith("@tiptap/")) {
        manifest[field][name] = "3.31.0-beta.1";
      }
    }
  }

  manifest.peerDependencies["@tiptap/pm"] = "3.31.0-beta.1";
  assert.equal(inspectTiptapContract(manifest).canonicalVersion, "3.31.0-beta.1");
});

test("reports malformed package JSON without attempting synchronization", () => {
  assert.throws(
    () => synchronizeTiptapContractSource('{"devDependencies":'),
    /package\.json must contain valid JSON/,
  );
});
