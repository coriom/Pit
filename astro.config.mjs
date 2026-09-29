import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
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
      styleDirective: { resources: ["'self'", "'unsafe-inline'"] },
      directives: [
        "connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com https://11155111.rpc.thirdweb.com https://ethereum.reth.rs https://mainnet.base.org https://arb1.arbitrum.io",
        "default-src 'none'",
        "font-src 'self' data:",
        "img-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ],
    },
  },
});
