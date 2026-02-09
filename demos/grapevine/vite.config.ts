import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist/server",
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
      },
    },
  },
  plugins: [cloudflare({ viteEnvironment: { name: "ssr" } })],
});
