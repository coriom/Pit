import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateTrackedFiles } from "../scripts/release/invariants.mjs";
import {
  acceptancePath, fromLine, toLine, transformAcceptanceSource,
  validateLiveMode, verifyAcceptanceDiff,
} from "../scripts/audit/uniswap-acceptance-worktree.mjs";
import { sourceGate } from "../scripts/audit/uniswap-runner-diagnostics.mjs";

const original = readFileSync(acceptancePath, "utf8");

describe("isolated Uniswap acceptance source", () => {
  it("changes exactly one gate line and leaves release validation blocked", () => {
    const transformed = transformAcceptanceSource(original);
    expect(transformed).toBe(original.replace(fromLine, toLine));
    expect(sourceGate(original)).toBe(false);
    expect(sourceGate(transformed)).toBe(true);
    expect(verifyAcceptanceDiff(original, transformed, [acceptancePath]))
      .toMatchObject({ transformedPath: acceptancePath });
    expect(() => validateTrackedFiles(new Map([[acceptancePath, Buffer.from(transformed)]])))
      .toThrow("Uniswap execution acceptance gate");
  });
  it("rejects extra source differences, duplicate gates and unexpected paths", () => {
    const transformed = transformAcceptanceSource(original);
    expect(() => transformAcceptanceSource(original + fromLine)).toThrow("ACCEPTANCE_SOURCE_UNEXPECTED");
    expect(() => verifyAcceptanceDiff(original, transformed + "\n", [acceptancePath]))
      .toThrow("ACCEPTANCE_SOURCE_UNEXPECTED");
    expect(() => verifyAcceptanceDiff(original, transformed,
      [acceptancePath, "src/lib/config.ts"]))
      .toThrow("ACCEPTANCE_SOURCE_UNEXPECTED");
  });
  it("retires the consumed Z.3 live mode and requires a new Z.5 authorization marker", () => {
    expect(() => validateLiveMode(["--z3-live"], {}))
      .toThrow("Z3_AUTHORIZATION_CONSUMED");
    expect(() => validateLiveMode(["--z5-live"], {}))
      .toThrow("UNISWAP_LIVE_RUN_NOT_AUTHORIZED");
    expect(() => validateLiveMode(["--z5-live"], { PIT_Z5_AUTHORIZED: "no" }))
      .toThrow("UNISWAP_LIVE_RUN_NOT_AUTHORIZED");
    expect(validateLiveMode(["--z3-read-only"], {})).toBe(false);
    expect(validateLiveMode(["--z5-live"], { PIT_Z5_AUTHORIZED: "yes" })).toBe(true);
  });
});
