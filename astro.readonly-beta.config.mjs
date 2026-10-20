import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { swapCostInlineHash } from "./scripts/build-swap-cost-inline.mjs";
import { bridgeCostInlineHash } from "./scripts/build-bridge-cost-inline.mjs";
import { portfolioExposureInlineHash } from "./scripts/build-portfolio-exposure-inline.mjs";

// Deliberately separate page tree and public directory: the full PIT routes,
// wallet islands and testnet assets are not inputs to this static candidate.
export default defineConfig({
  srcDir: "./src/read-only-beta",
  publicDir: "./src/read-only-beta/public",
  outDir: "./dist-readonly-beta",
  output: "static",
  devToolbar: { enabled: false },
  vite: {
    experimental: { renderBuiltUrl: () => ({ relative: true }) },
    cacheDir: "node_modules/.vite-pit-readonly",
    resolve: {
      alias: [
        {
          find: /^.*styles\/global\.css$/,
          replacement: fileURLToPath(
            new URL("./src/read-only-beta/frozen.css", import.meta.url),
          ),
        },
      ],
    },
    plugins: [tailwindcss()],
  },
  experimental: {
    csp: {
      scriptDirective: {
        hashes: [
          swapCostInlineHash(),
          bridgeCostInlineHash(),
          portfolioExposureInlineHash(),
        ],
      },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      directives: [
        "connect-src 'none'",
        "default-src 'none'",
        "font-src 'self'",
        "img-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
});
