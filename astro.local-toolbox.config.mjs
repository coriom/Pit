import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import { swapCostInlineHash } from "./scripts/build-swap-cost-inline.mjs";
import { bridgeCostInlineHash } from "./scripts/build-bridge-cost-inline.mjs";
import { portfolioExposureInlineHash } from "./scripts/build-portfolio-exposure-inline.mjs";
import { ahInlineHash } from "./scripts/build-ah-inline.mjs";
import { aiInlineHash } from "./scripts/build-ai-inline.mjs";
import { ajInlineHash } from "./scripts/build-aj-inline.mjs";
import { akInlineHash } from "./scripts/build-ak-inline.mjs";
import { alInlineHash } from "./scripts/build-al-inline.mjs";
import { amInlineHash } from "./scripts/build-am-inline.mjs";
import { anInlineHash } from "./scripts/build-an-inline.mjs";
import { publicOriginFromEnv } from "./scripts/release/local-toolbox-publishing.mjs";

const publicOrigin = publicOriginFromEnv();

// Separate entry tree and static public directory. The full PIT route tree,
// wallet integrations and testnet assets are not build inputs.
export default defineConfig({
  srcDir: "./src/local-toolbox",
  publicDir: "./src/local-toolbox/public",
  outDir: publicOrigin ? "./dist-local-toolbox-public" : "./dist-local-toolbox",
  site: publicOrigin ?? undefined,
  output: "static",
  devToolbar: { enabled: false },
  vite: {
    experimental: { renderBuiltUrl: () => ({ relative: true }) },
    cacheDir: "node_modules/.vite-pit-local-toolbox",
    resolve: {
      alias: [{
        find: /^.*styles\/global\.css$/,
        replacement: fileURLToPath(new URL("./src/read-only-beta/frozen.css", import.meta.url)),
      }],
    },
  },
  experimental: {
    csp: {
      scriptDirective: {
        hashes: [
          swapCostInlineHash(), bridgeCostInlineHash(), portfolioExposureInlineHash(),
          ahInlineHash("converter"), ahInlineHash("yield"),
          aiInlineHash("trade"), aiInlineHash("execution"),
          ajInlineHash("rebalance"), ajInlineHash("performance"),
          akInlineHash("staking"), akInlineHash("vesting"),
          alInlineHash("collateral"), alInlineHash("borrowing"),
          amInlineHash("amm"), amInlineHash("concentrated"),
          anInlineHash("evm"), anInlineHash("csv"),
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
