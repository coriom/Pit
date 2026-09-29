import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: process.env.PIT_E2E_URL ?? "http://127.0.0.1:4398",
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: "pnpm preview --port 4398",
    url: "http://127.0.0.1:4398",
    reuseExistingServer: false,
  },
  reporter: "list",
});
