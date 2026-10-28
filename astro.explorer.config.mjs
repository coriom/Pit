import { defineConfig } from "astro/config";

// Deliberately separate from the offline Toolbox and full application trees.
export default defineConfig({
  srcDir: "./src/read-only-explorer",
  publicDir: "./src/read-only-explorer/public",
  outDir: "./dist-read-only-explorer",
  output: "static",
  devToolbar: { enabled: false },
  vite: { cacheDir: "node_modules/.vite-pit-explorer" },
  experimental: { csp: {
    scriptDirective: { resources: ["'self'"] },
    styleDirective: { resources: ["'self'"] },
    directives: [
      "default-src 'none'",
      "connect-src https://eth.drpc.org https://base.drpc.org https://sepolia.base.org",
      "font-src 'self'", "img-src 'self'", "object-src 'none'",
      "base-uri 'self'", "form-action 'none'",
    ],
  } },
});
