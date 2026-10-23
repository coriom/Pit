import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: 'premium.e2e.spec.ts',
  fullyParallel: false,
  workers: 1,
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...(process.env.PIT_FIREFOX_EXECUTABLE ? { launchOptions: { executablePath: process.env.PIT_FIREFOX_EXECUTABLE } } : {}) } },
  ],
  use: { baseURL: 'http://127.0.0.1:4412' },
  webServer: { command: 'pnpm premium:dev', url: 'http://127.0.0.1:4412', reuseExistingServer: false, timeout: 30_000 },
  reporter: 'list',
});
