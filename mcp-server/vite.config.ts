import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "src", "apps", "build-view"),
  plugins: [viteSingleFile()],
  build: {
    outDir: path.join(root, "dist", "ui"),
    emptyOutDir: false,
    rollupOptions: { input: path.join(root, "src", "apps", "build-view", "index.html") },
  },
  esbuild: { jsx: "automatic" },
});
