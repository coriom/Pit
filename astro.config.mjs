import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { swapCostInlineHash } from "./scripts/build-swap-cost-inline.mjs";
import { bridgeCostInlineHash } from "./scripts/build-bridge-cost-inline.mjs";
import { portfolioExposureInlineHash } from "./scripts/build-portfolio-exposure-inline.mjs";
import { ahInlineHash } from "./scripts/build-ah-inline.mjs";
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
