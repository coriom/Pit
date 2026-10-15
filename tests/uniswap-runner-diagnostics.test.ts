import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  assertFreshAfterApproval,
  safeRunnerFailure,
  sourceGate,
  verifyServedSource,
} from "../scripts/audit/uniswap-runner-diagnostics.mjs";

const source = readFileSync("src/lib/uniswap-execution.ts", "utf8");
const served = (value: string) => `export default ${JSON.stringify(value)};\n`;

describe("test-only Uniswap runner diagnostics", () => {
  it("rejects disabled execution before wallet access and verifies exact served source", () => {
    expect(sourceGate(source)).toBe(false);
    expect(verifyServedSource(source, served(source)).executionAccepted).toBe(false);
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
