import { defineConfig } from "astro/config";
import { readFileSync } from "node:fs";
import { validateSepoliaConfig } from "./scripts/operations/sepolia-config.mjs";
import { validateWalletCampaign } from "./scripts/operations/wallet-campaign.mjs";

const mode = process.env.PIT_OPERATIONS_MODE ?? "local";
if (!["local", "base-sepolia", "base-sepolia-wallet"].includes(mode)) throw Error("Unsupported operations build mode");
const testnet = mode !== "local";
const walletPreview = mode === "base-sepolia-wallet";
// A wallet preview is never a host package. It is only served from loopback after an
// explicit local opt-in; the ordinary Base Sepolia build remains read-only.
if (walletPreview && process.env.PIT4B_LOCAL_WALLET_PREVIEW !== "enabled") throw Error("Wallet preview requires explicit local opt-in");
const deployment = testnet ? validateSepoliaConfig(JSON.parse(readFileSync("deployments/base-sepolia.json", "utf8"))) : null;
const campaign = walletPreview && process.env.PIT4B_CAMPAIGN_PATH
  ? validateWalletCampaign(JSON.parse(readFileSync(process.env.PIT4B_CAMPAIGN_PATH, "utf8")), deployment)
  : null;
export default defineConfig({
  srcDir: walletPreview ? "./src/operations-sepolia-wallet" : testnet ? "./src/operations-sepolia" : "./src/operations",
  publicDir: testnet ? "./src/operations/public-sepolia" : "./src/operations/public",
  outDir: walletPreview ? "./dist-operations-sepolia-wallet" : testnet ? "./dist-operations-sepolia" : "./dist-operations",
  output: "static",
  build: { inlineStylesheets: "never" },
  devToolbar: { enabled: false },
  vite: { cacheDir: "node_modules/.vite-pit-operations", define: { __PIT_HOSTED_STAGING__: JSON.stringify(process.env.PIT_HOSTED_STAGING === "1"), __PIT_SEPOLIA_CONFIG__: JSON.stringify(deployment), __PIT4B_CAMPAIGN__: JSON.stringify(campaign) }, experimental: { renderBuiltUrl: () => ({ relative: true }) } },
});
