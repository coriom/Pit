import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/identity-e2e",
  workers: 1,
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
  ],
  reporter: "list",
});
