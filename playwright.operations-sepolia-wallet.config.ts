import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/operations-wallet-e2e", workers: 1, timeout: 90_000,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  use: { baseURL: "http://127.0.0.1:4416", viewport: { width: 390, height: 844 } },
  webServer: {
    command: "PIT_OPERATIONS_MODE=base-sepolia-wallet PIT4B_LOCAL_WALLET_PREVIEW=enabled PIT4B_CAMPAIGN_PATH= pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4416",
    url: "http://127.0.0.1:4416", reuseExistingServer: false,
  },
  reporter: "list",
});
