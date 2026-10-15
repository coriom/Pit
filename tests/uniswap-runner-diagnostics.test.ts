import { readFileSync } from "node:fs";
import { encodeFunctionData, parseAbi } from "viem";
import { describe, expect, it, vi } from "vitest";
import {
  assertFreshAfterApproval,
  assertCheckpointValidity,
  assertLoopbackFree,
  mockReviewedSwapGasEstimate,
  safeRunnerFailure,
  sourceGate,
  verifyServedSource,
} from "../scripts/audit/uniswap-runner-diagnostics.mjs";

const source = readFileSync("src/lib/uniswap-execution.ts", "utf8");
const served = (value: string) => `export default ${JSON.stringify(value)};\n`;
const servedTemplate = (value: string) =>
  `export default \`${value}\`;\n\n/` + "/# sourceMapping" + "URL=data:application/json;base64,e30=\n";
const abi = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)"]);
const owner = "0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96";
const router = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";
const usdc = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const weth = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
const spec = { owner, router, sellToken: usdc, buyToken: weth, sellAmount: 10000000n };
const calldata = (overrides = {}) => encodeFunctionData({ abi, functionName: "exactInputSingle",
  args: [{ tokenIn: usdc, tokenOut: weth, fee: 500, recipient: owner,
    amountIn: 10000000n, amountOutMinimum: 216929911610444n,
    sqrtPriceLimitX96: 0n, ...overrides }] });

describe("test-only Uniswap runner diagnostics", () => {
  it("rejects disabled execution before wallet access and verifies exact served source", () => {
    expect(sourceGate(source)).toBe(false);
    expect(verifyServedSource(source, served(source)).executionAccepted).toBe(false);
    expect(verifyServedSource(source, servedTemplate(source)).executionAccepted).toBe(false);
    expect(() => verifyServedSource(source, servedTemplate(source + "\n// extra")))
      .toThrow("STALE_OR_WRONG_BUILD");
    expect(() => verifyServedSource(source, servedTemplate(source) + "\nalert(1)"))
      .toThrow("STALE_OR_WRONG_BUILD");
    expect(() => verifyServedSource(source, served(source.replace("UNISWAP_EXECUTION_ACCEPTED = false", "UNISWAP_EXECUTION_ACCEPTED = true"))))
      .toThrow("STALE_OR_WRONG_BUILD");
    expect(() => verifyServedSource(source, "<html>Vercel login</html>"))
      .toThrow("STALE_OR_WRONG_BUILD");
  });

  it("requires a genuinely later, still-live quote after approval", () => {
    expect(() => assertFreshAfterApproval(1000, 2000, 1500)).not.toThrow();
    expect(() => assertFreshAfterApproval(1000, 1000, 900)).toThrow("QUOTE_EXPIRED");
    expect(() => assertFreshAfterApproval(1000, 2000, 2000)).toThrow("QUOTE_EXPIRED");
    expect(() => assertFreshAfterApproval(1000, Number.NaN, 900)).toThrow("QUOTE_EXPIRED");
  });

  it("requires ten actual seconds remaining at the wallet checkpoint", () => {
    expect(assertCheckpointValidity(20_000, 10_000)).toBe(10_000);
    expect(() => assertCheckpointValidity(19_999, 10_000)).toThrow("QUOTE_EXPIRED");
    expect(() => assertCheckpointValidity(20_000, 20_000)).toThrow("QUOTE_EXPIRED");
    expect(() => assertCheckpointValidity(Number.NaN, 10_000)).toThrow("QUOTE_EXPIRED");
  });

  it("refuses a swap wallet call after a slow read consumes the quote lifetime", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-15T00:00:00.000Z"));
      const expiresAt = Date.now() + 30_000;
      const wallet = vi.fn();
      const slowRpc = new Promise<void>((resolve) => setTimeout(resolve, 31_000));
      await vi.advanceTimersByTimeAsync(31_000);
      await slowRpc;
      expect(() => assertCheckpointValidity(expiresAt)).toThrow("QUOTE_EXPIRED");
      expect(wallet).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("mocks gas only for the exact reviewed post-approval swap scope", () => {
    const tx = { from: owner, to: router, value: "0x0", data: calldata() };
    expect(mockReviewedSwapGasEstimate(tx, spec)).toBe("0x3d090");
    for (const altered of [
      { ...tx, from: weth }, { ...tx, to: usdc }, { ...tx, value: "0x1" },
      { ...tx, data: calldata({ tokenOut: usdc }) },
      { ...tx, data: calldata({ fee: 3000 }) },
      { ...tx, data: calldata({ amountIn: 10000001n }) },
      { ...tx, data: calldata({ recipient: weth }) },
      { ...tx, data: calldata({ amountOutMinimum: 0n }) },
      { ...tx, data: calldata({ sqrtPriceLimitX96: 1n }) },
      { ...tx, data: "0x" },
    ]) expect(() => mockReviewedSwapGasEstimate(altered, spec)).toThrow("UNISWAP_MOCK_GAS_SCOPE");
  });

  it("refuses an existing listener and fails closed on an uncertain probe", async () => {
    await expect(assertLoopbackFree("http://127.0.0.1:4397", async () => ({ status: 200 }) as never))
      .rejects.toThrow("STALE_OR_WRONG_BUILD");
    await expect(assertLoopbackFree("http://127.0.0.1:4397", async () => { throw Error("timeout"); }))
      .rejects.toThrow("STALE_OR_WRONG_BUILD");
    await expect(assertLoopbackFree("http://127.0.0.1:4397", async () => {
      throw Object.assign(Error("refused"), { cause: { code: "ECONNREFUSED" } });
    })).resolves.toBeUndefined();
  });

  it("classifies disabled, expired, wallet, timeout and receipt failures without inventing success", () => {
    expect(safeRunnerFailure(Error("UNISWAP_NOT_ACCEPTED"), "server_identity").classification)
      .toBe("EXECUTION_DISABLED");
    expect(safeRunnerFailure(Error("QUOTE_EXPIRED"), "approval_checkpoint").classification)
      .toBe("QUOTE_EXPIRED");
    expect(safeRunnerFailure(Error("rejected"), "wallet_transaction_request").classification)
      .toBe("WALLET_PROVIDER_FAILURE");
    expect(safeRunnerFailure(Object.assign(Error("slow"), { name: "TimeoutError" }), "rpc_balance").classification)
      .toBe("RPC_TIMEOUT");
    expect(safeRunnerFailure(Error("reverted"), "approval_receipt", { hashReturned: true }).classification)
      .toBe("RECEIPT_FAILED");
    expect(safeRunnerFailure(Error("uncertain"), "wallet_transaction_request",
      { signingAttempted: true, submissionAttempted: true }).classification)
      .toBe("BROADCAST_AMBIGUOUS");
  });

  it("redacts nested credentials, arbitrary messages and unexpected API data", () => {
    const sentinel = "SYNTHETIC_CREDENTIAL_SENTINEL_DO_NOT_LOG";
    const error = Object.assign(Error(`request failed: ${sentinel}`), {
      status: 503,
      code: `secret-${sentinel}`,
      cause: { message: sentinel, data: { authorization: sentinel,
        errors: [Error("QUOTE_EXPIRED"), { url: `https://example.test/?token=${sentinel}` }] } },
    });
    const result = safeRunnerFailure(error, "fresh_quote_after_approval", { signingAttempted: false });
    expect(result.safeCode).toBe("QUOTE_EXPIRED");
    expect(result.httpStatus).toBe(503);
    expect(JSON.stringify(result)).not.toContain(sentinel);
    expect(JSON.stringify(result)).not.toContain("example.test");
    expect(result.signingAttempted).toBe(false);
  });
});
