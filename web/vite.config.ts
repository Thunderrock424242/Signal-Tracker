import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { offlineShell } from "./offline-plugin.ts";
export default defineConfig({
  plugins: [offlineShell()],
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: process.env.PAGES_BASE_PATH ?? "/",
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { outDir: "dist", emptyOutDir: true },
  preview: { host: "127.0.0.1", port: 4173 },
});
