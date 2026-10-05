// Public-address read-only operator observation. No wallet transport is imported.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createProbeFetch } from "./quote-probe-runtime.mjs";

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== "--address") {
  console.error("Usage: pnpm operator:observe --address 0xPUBLIC_EVM_ADDRESS");
  process.exitCode = 3;
} else {
  try {
    await mkdir(".astro", { recursive: true });
    await build({
      entryPoints: ["src/lib/operator-observer.ts"],
      outfile: ".astro/operator-observer.mjs",
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      logLevel: "silent",
    });
    const { observeCowOperator, publicOperatorObserverOps, OBSERVER_RPC_URL } =
      await import(
        pathToFileURL(`${process.cwd()}/.astro/operator-observer.mjs`).href
      );
    // The Node-only request-scoped fetch preserves the Phase S finite RPC budget.
    const result = await observeCowOperator(
      args[1],
      publicOperatorObserverOps(createProbeFetch(OBSERVER_RPC_URL)),
    );
    console.log(JSON.stringify(result, null, 2));
    console.error(
      `\n${result.observerReady ? "OBSERVER READY" : "OBSERVER BLOCKED"} · WALLET EXECUTION READY: NO`,
    );
    console.error(`Public account: ${result.account}`);
    for (const item of result.readiness)
      console.error(`${item.status} ${item.label}: ${item.detail}`);
    if (result.handoff) {
      console.error(`ACTION REQUIRED — ${result.handoff.action}`);
      console.error(`Wallet: ${result.handoff.wallet}`);
      console.error(`Network: ${result.handoff.network}`);
      console.error(`Token: ${result.handoff.token}`);
      console.error(`Spender: ${result.handoff.spender}`);
      console.error(
        `Required allowance: ${result.handoff.requiredAllowance} base units`,
      );
      console.error(
        `Current allowance: ${result.handoff.currentAllowance} base units`,
      );
      console.error(
        `Estimated approval gas: ${result.handoff.estimatedApprovalGasUnits ?? "not required"} units`,
      );
      console.error(
        "No approval or order has been submitted. A new wallet-bound executable quote and GREEN preflight are required before manual wallet consent.",
      );
    }
    console.error(result.nextAction);
    process.exitCode = result.observerReady ? 0 : 2;
  } catch (error) {
    console.error(
      `OBSERVER ERROR: ${error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[endpoint]") : String(error)}`,
    );
    process.exitCode = 3;
  }
}
