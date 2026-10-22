import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/explorer-e2e", workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  use: { baseURL: "http://127.0.0.1:4403", viewport: { width: 390, height: 844 } },
  webServer: { command: "pnpm exec astro preview --config astro.explorer.config.mjs --host 127.0.0.1 --port 4403", url: "http://127.0.0.1:4403", reuseExistingServer: false },
  reporter: "list",
});
