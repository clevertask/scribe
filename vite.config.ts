import { defineConfig } from "vite";
import { resolve, extname, relative } from "path";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { libInjectCss } from "vite-plugin-lib-inject-css";
import { glob } from "glob";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), libInjectCss()],
  build: {
    lib: {
      entry: resolve(__dirname, "lib/main.ts"),
      formats: ["es"],
    },
    copyPublicDir: false,
    rollupOptions: {
      external: ["@radix-ui/themes", "react", "react/jsx-runtime", "react-dom"],
      input: Object.fromEntries(
        glob.sync("lib/**/*.{ts,tsx}").map((file) => [
          // The name of the entry point
          // lib/nested/foo.ts becomes nested/foo
          relative("lib", file.slice(0, file.length - extname(file).length)),
          // The absolute path to the entry file
          // lib/nested/foo.ts becomes /project/lib/nested/foo.ts
          fileURLToPath(new URL(file, import.meta.url)),
        ]),
      ),
      output: {
        assetFileNames: "assets/[name][extname]",
        entryFileNames: "[name].js",
      },
    },
  },
});
