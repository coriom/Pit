import { describe, expect, it } from "vitest";
import {
  compatiblePorts,
  PURE_TOOL_CONTRACTS,
  runPureTool,
} from "../src/lib/pure-tool-contract";
import {
  runAkTool,
  stakingRewardsContract,
  vestingUnlocksContract,
} from "../src/lib/ak-tool-contracts";

const staking = {
  mode: "projection",
  tokenLabel: "TOKEN",
  decimals: 6,
  stake: "1000",
  grossAprBps: "1200",
  elapsedDays: 365,
  commissionBps: "1000",
  otherFee: "0",
  otherFeeCoverage: "none",
};
const vesting = {
  mode: "linear",
  tokenLabel: "TOKEN",
  decimals: 6,
  totalAllocation: "10000",
  startDate: "2026-01-01",
  endDate: "2027-01-01",
  cliffDate: "2026-04-01",
  observationDate: "2026-05-01",
  previouslyReceived: "0",
};

describe("Phase AK closed local contracts", () => {
  it("adds only two reviewed IDs and still denies execution IDs", () => {
    expect(PURE_TOOL_CONTRACTS.map((item) => item.id)).toEqual([
      "swap-cost",
      "portfolio-exposure",
      "token-fee-converter",
      "yield-growth",
      "trade-risk",
      "execution-math",
      "portfolio-rebalance",
      "performance-drawdown",
      "staking-rewards",
      "vesting-unlocks",
    ]);
    for (const id of [
      "swap",
      "perps",
      "taxlot-export",
      "wallet",
      "token-approvals",
    ]) {
      const result = runPureTool(id, {});
      expect(result.status).toBe("ERROR");
      if (result.status === "ERROR")
        expect(result.error.code).toBe("UNSUPPORTED_CALCULATION");
    }
  });
  it("validates mode-specific shapes and exact output identities", () => {
    const s = runAkTool("staking-rewards", staking);
    expect(s.status).toBe("COMPLETE");
    if (s.status === "ERROR") throw Error(s.error.message);
    expect(
      runAkTool("staking-rewards", { ...staking, secret: "x" }).status,
    ).toBe("ERROR");
    expect(() =>
      stakingRewardsContract.validateOutput({
        ...s.output,
        fields: s.output.fields.map((field) =>
          field.name === "operatorCommission" ? { ...field, raw: "1" } : field,
        ),
      }),
    ).toThrow(/identity/);
    const v = runAkTool("vesting-unlocks", vesting);
    expect(v.status).toBe("COMPLETE");
    if (v.status === "ERROR") throw Error(v.error.message);
    expect(() =>
      vestingUnlocksContract.validateOutput({
        ...v.output,
        fields: v.output.fields.map((field) =>
          field.name === "lockedAllocation" ? { ...field, raw: "1" } : field,
        ),
      }),
    ).toThrow(/conservation/);
    expect(
      runAkTool("vesting-unlocks", { ...vesting, previouslyReceived: "10001" })
        .status,
    ).toBe("ERROR");
  });
  it("does not infer same-token identity, APR equivalence or date compatibility", () => {
    const reward = runAkTool("staking-rewards", staking);
    const vested = runAkTool("vesting-unlocks", vesting);
    const later = runAkTool("vesting-unlocks", {
      ...vesting,
      observationDate: "2026-06-01",
    });
    if (
      reward.status === "ERROR" ||
      vested.status === "ERROR" ||
      later.status === "ERROR"
    )
      throw Error("Unexpected contract error");
    expect(reward.values[0].port.unit?.kind).toBe("token");
    expect(compatiblePorts(reward.values[0].port, vested.values[0].port)).toBe(
      false,
    );
    expect(compatiblePorts(vested.values[0].port, later.values[0].port)).toBe(
      false,
    );
    expect(compatiblePorts(reward.inputPorts[1], reward.values[0].port)).toBe(
      false,
    );
    expect(vested.values[0].port.observedAt).toBe("2026-05-01");
  });
  it("keeps missing cost coverage incomplete and out of result ports", () => {
    const unknown = runAkTool("staking-rewards", {
      ...staking,
      otherFeeCoverage: "unknown",
      otherFee: "",
    });
    expect(unknown.status).toBe("INCOMPLETE");
    if (unknown.status === "ERROR") throw Error(unknown.error.message);
    expect(unknown.values).toEqual([]);
    expect(
      runAkTool("staking-rewards", { ...staking, elapsedDays: -1 }).status,
    ).toBe("ERROR");
  });
});
