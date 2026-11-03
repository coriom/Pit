import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"], maxWorkers: process.env.CI ? 2 : undefined },
});
