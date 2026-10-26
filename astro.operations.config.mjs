import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";
import { validateSepoliaConfig } from "./scripts/operations/sepolia-config.mjs";

const mode = process.env.PIT_OPERATIONS_MODE ?? "local";
if (mode !== "local" && mode !== "base-sepolia") throw Error("Unsupported operations build mode");
const testnet = mode === "base-sepolia";
const deployment = testnet ? validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8"))) : null;
export default defineConfig({
  srcDir: testnet ? "./src/operations-sepolia" : "./src/operations",
  publicDir: testnet ? "./src/operations/public-sepolia" : "./src/operations/public",
  outDir: testnet ? "./dist-operations-sepolia" : "./dist-operations",
  output: "static",
  build: { inlineStylesheets: "never" },
  devToolbar: { enabled: false },
  vite: { cacheDir: "node_modules/.vite-pit-operations", define: { __PIT_SEPOLIA_CONFIG__: JSON.stringify(deployment) }, experimental: { renderBuiltUrl: () => ({ relative: true }) } },
});
