import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/staging-e2e",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4415", viewport: { width: 390, height: 844 } },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "firefox", use: { browserName: "firefox" } }],
  webServer: {
    command: "python3 -m http.server 4415 --bind 127.0.0.1 --directory dist-product-cloudflare-staging/public",
    url: "http://127.0.0.1:4415",
    reuseExistingServer: false,
  },
  reporter: "list",
});
