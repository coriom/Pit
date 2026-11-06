import { defineConfig, devices } from "@playwright/test";
const reuseLocalServers = process.env.PIT_BACKEND_E2E_REUSE === "1";
export default defineConfig({
  // Firefox cold start on this shared WSL host exceeded 30s while the same
  // assertions passed in a quiet targeted run; this bounds setup contention.
  testDir: "backend/e2e", workers: 1, timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:4399" },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }, { name: "firefox", use: devices["Desktop Firefox"] }],
  webServer: [
    { command: "node backend/test/browser-harness.mjs", url: "http://127.0.0.1:8790/pit/api/v1/health", reuseExistingServer: reuseLocalServers, timeout: 20_000 },
    { command: "pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4399", url: "http://127.0.0.1:4399", reuseExistingServer: reuseLocalServers, timeout: 90_000 },
  ], reporter: "list",
});
