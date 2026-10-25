import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/operations-e2e", workers: 1,
  use: { baseURL: "http://127.0.0.1:4414", viewport: { width: 390, height: 844 } },
  webServer: { command: "pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4414", url: "http://127.0.0.1:4414", reuseExistingServer: false },
  reporter: "list",
});
