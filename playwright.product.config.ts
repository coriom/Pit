import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/product-e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4414", viewport: { width: 390, height: 844 } },
  webServer: { command: "pnpm product:preview:serve", url: "http://127.0.0.1:4414", reuseExistingServer: false },
  reporter: "list",
});
