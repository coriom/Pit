import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/operations-wallet-fork-e2e", workers: 1, timeout: 420_000,
  // Run each project against a newly started fork: the exact campaign nonce
  // sequence intentionally cannot be replayed on the same chain state.
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "firefox", use: { browserName: "firefox" } }],
  use: { baseURL: "http://127.0.0.1:4417", viewport: { width: 390, height: 844 } },
  webServer: {
    command: "PIT_OPERATIONS_MODE=base-sepolia-wallet PIT4B_LOCAL_WALLET_PREVIEW=enabled PIT4B_CAMPAIGN_PATH=/tmp/pit4b-anvil-campaign.json pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4417",
    url: "http://127.0.0.1:4417", reuseExistingServer: false,
  },
  reporter: "list",
});
