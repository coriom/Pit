import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/operations-phase5-e2e", workers: 1, timeout: 180_000,
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "firefox", use: { browserName: "firefox" } }],
  use: { baseURL: "http://127.0.0.1:4418", viewport: { width: 390, height: 844 }, acceptDownloads: true },
  webServer: { command: "pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4418", url: "http://127.0.0.1:4418", reuseExistingServer: false },
  reporter: "list",
});
