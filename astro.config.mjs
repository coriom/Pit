import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
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
export default defineConfig({
  output: "static",
  devToolbar: { enabled: false },
  integrations: [react()],
  vite: {
    experimental: { renderBuiltUrl: () => ({ relative: true }) },
    cacheDir: "node_modules/.vite-pit",
    plugins: [tailwindcss()],
    resolve: {
      dedupe: ["react", "react-dom", "wagmi", "@tanstack/react-query"],
    },
    optimizeDeps: { include: ["wagmi", "connectkit", "@tanstack/react-query"] },
  },
  experimental: {
    csp: {
      scriptDirective: {
        hashes: [
          swapCostInlineHash(),
          bridgeCostInlineHash(),
          portfolioExposureInlineHash(),
          ahInlineHash("converter"),
          ahInlineHash("yield"),
          aiInlineHash("trade"),
          aiInlineHash("execution"),
          ajInlineHash("rebalance"),
          ajInlineHash("performance"),
          akInlineHash("staking"),
          akInlineHash("vesting"),
          alInlineHash("collateral"),
          alInlineHash("borrowing"),
          amInlineHash("amm"),
          amInlineHash("concentrated"),
          anInlineHash("evm"),
          anInlineHash("csv"),
        ],
      },
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      directives: [
        "connect-src 'self' https://api.cow.fi https://api.hyperliquid-testnet.xyz https://rpc.hyperliquid-testnet.xyz https://ethereum-sepolia-rpc.publicnode.com https://11155111.rpc.thirdweb.com",
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
