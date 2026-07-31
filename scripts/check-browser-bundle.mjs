import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

const bundleDirectory = resolve(process.argv[2] ?? "dist");
const incompatibleRuntimeMarkers = [
  "Calling `require` for",
  "doesn't expose the `require` function",
];

async function getJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);

      if (entry.isDirectory()) {
        return getJavaScriptFiles(path);
      }

      return [".js", ".mjs", ".cjs"].includes(extname(entry.name)) ? [path] : [];
    }),
  );

  return files.flat();
}

const files = await getJavaScriptFiles(bundleDirectory);

if (files.length === 0) {
  throw new Error(`No JavaScript files found in ${bundleDirectory}`);
}

const incompatibleFiles = [];

for (const file of files) {
  const contents = await readFile(file, "utf8");

  if (incompatibleRuntimeMarkers.every((marker) => contents.includes(marker))) {
    incompatibleFiles.push(relative(process.cwd(), file));
  }
}

if (incompatibleFiles.length > 0) {
  throw new Error(
    [
      "Found a browser-incompatible external require runtime in:",
      ...incompatibleFiles.map((file) => `- ${file}`),
    ].join("\n"),
  );
}
