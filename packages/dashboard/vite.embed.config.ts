import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Separate build target from vite.config.ts's main dashboard app: this one
// produces a single self-contained dist-embed/embed.html (JS/CSS inlined, no
// separate asset requests) so the VS Code webview and the Mac app's
// WKWebView can each load one local file with no relative-path or CSP
// wiring beyond what embed.html already declares.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    outDir: "dist-embed",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./embed.html", import.meta.url)),
    },
  },
});
