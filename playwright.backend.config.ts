import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "backend/e2e", workers: 1, timeout: 30_000,
  use: { baseURL: "http://127.0.0.1:4399" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }, { name: "firefox", use: devices["Desktop Firefox"] }],
  webServer: [
    { command: "node backend/test/browser-harness.mjs", url: "http://127.0.0.1:8790/pit/api/v1/health", reuseExistingServer: false, timeout: 20_000 },
    { command: "pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4399", url: "http://127.0.0.1:4399", reuseExistingServer: false, timeout: 30_000 },
  ], reporter: "list",
});
