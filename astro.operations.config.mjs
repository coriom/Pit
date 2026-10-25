import { defineConfig } from "astro/config";
export default defineConfig({
  srcDir: "./src/operations",
  publicDir: "./src/operations/public",
  outDir: "./dist-operations",
  output: "static",
  build: { inlineStylesheets: "never" },
  devToolbar: { enabled: false },
  vite: { cacheDir: "node_modules/.vite-pit-operations", experimental: { renderBuiltUrl: () => ({ relative: true }) } },
});
