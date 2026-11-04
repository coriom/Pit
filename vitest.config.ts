import { defineConfig } from "vitest/config";
export default defineConfig({
  // CI hosts also start browser and build processes; one worker avoids a
  // scheduler stall being mistaken for a product regression in short RPC mocks.
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"], maxWorkers: process.env.CI ? 1 : undefined },
});
