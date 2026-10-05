// Public identifier verification only; no wallet, signing or submission API.
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createProbeFetch } from "./quote-probe-runtime.mjs";

const args = process.argv.slice(2);
const syntax =
  args.length === 4 &&
  args[0] === "--address" &&
  ["--approval-tx", "--order-uid"].includes(args[2]);
if (!syntax) {
  console.error(
    "Usage: pnpm operator:verify --address 0xPUBLIC_ADDRESS --approval-tx 0xPUBLIC_TX_HASH\n   or: pnpm operator:verify --address 0xPUBLIC_ADDRESS --order-uid 0xPUBLIC_ORDER_UID",
  );
  process.exitCode = 3;
} else {
  try {
    await mkdir(".astro", { recursive: true });
    await build({
      entryPoints: ["src/lib/operator-verification.ts"],
      outfile: ".astro/operator-verification.mjs",
      bundle: true,
      packages: "external",
      platform: "node",
      format: "esm",
      logLevel: "silent",
    });
    const { verifyPublicApproval, verifyPublicOrder, publicVerificationOps } =
      await import(
        pathToFileURL(`${process.cwd()}/.astro/operator-verification.mjs`).href
      );
    const { OBSERVER_RPC_URL, observeCowOperator, publicOperatorObserverOps } =
      await import(
        pathToFileURL(`${process.cwd()}/.astro/operator-verification.mjs`).href
      );
    const rpcFetch = createProbeFetch(OBSERVER_RPC_URL);
    const ops = publicVerificationOps(rpcFetch);
    let result;
    if (args[2] === "--approval-tx") {
      result = await verifyPublicApproval(args[1], args[3], ops);
    } else {
      // Three read-only observations, no order resubmission or wallet action.
      for (let attempt = 0; attempt < 3; attempt++) {
        result = await verifyPublicOrder(args[1], args[3], ops);
        if (result.terminal || attempt === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }
    }
    const refreshed = await observeCowOperator(
      args[1],
      publicOperatorObserverOps(rpcFetch),
    );
    console.log(
      JSON.stringify(
        { verification: result, refreshedReadiness: refreshed },
        null,
        2,
      ),
    );
    console.error(result.nextAction);
    process.exitCode =
      result.kind === "cow-approval"
        ? result.verified
          ? 0
          : 2
        : result.terminal
          ? 0
          : 2;
  } catch (error) {
    console.error(
      `PUBLIC VERIFICATION ERROR: ${error instanceof Error ? error.message.replace(/https?:\/\/\S+/g, "[endpoint]") : String(error)}`,
    );
    process.exitCode = 3;
  }
}
