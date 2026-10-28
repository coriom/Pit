import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/operations-phase6-e2e", workers: 1, timeout: 180_000,
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "firefox", use: { browserName: "firefox" } }],
  use: { baseURL: "http://127.0.0.1:4419", viewport: { width: 390, height: 844 }, acceptDownloads: true },
  webServer: { command: "pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4419", url: "http://127.0.0.1:4419", reuseExistingServer: false },
  reporter: "list",
});
