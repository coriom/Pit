import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import {
  APPROVAL_CHAIN_ID,
  APPROVAL_COVERAGE,
  APPROVAL_SPENDERS,
  APPROVAL_TOKENS,
  MAX_BLOCK_AGE_MS,
  approvalReportJSON,
  inspectTokenApprovals,
  type ApprovalReadOps,
} from "../src/lib/token-approvals";

const owner = "0x29d0B5939dcC4D0492D72ABd1210dEbd6c90cC96";
const observed = Date.parse("2026-10-15T10:50:15Z");
const blockTime = BigInt(Math.floor((observed - 3000) / 1000));
const key = (token: string, spender: string) =>
  `${token.toLowerCase()}:${spender.toLowerCase()}`;

function fixture(overrides: Partial<ApprovalReadOps> = {}) {
  const calls: string[] = [];
  const values = new Map<string, bigint>([
    [
      key(APPROVAL_TOKENS[0].address, APPROVAL_SPENDERS[0].address),
      10_000_000n,
    ],
  ]);
  const ops: ApprovalReadOps = {
    chainId: async () => {
      calls.push("chainId");
      return APPROVAL_CHAIN_ID;
    },
    block: async () => ({ number: 11919946n, timestamp: blockTime }),
    code: async () => "0x6000" as Hex,
    decimals: async (token) =>
      token.toLowerCase() === APPROVAL_TOKENS[0].address.toLowerCase() ? 6 : 18,
    balance: async (token) =>
      token.toLowerCase() === APPROVAL_TOKENS[0].address.toLowerCase()
        ? 270_299_154n
        : 0n,
    allowance: async (token, account, spender, block) => {
      calls.push(`allowance:${token}:${spender}:${block}`);
      expect(account.toLowerCase()).toBe(owner.toLowerCase());
      return { token, spender, value: values.get(key(token, spender)) ?? 0n };
    },
    ...overrides,
  };
  return { ops, calls, values };
}

describe("read-only Sepolia approval inspector", () => {
  it("checks only four fixed pairs at one block and distinguishes capacity from balance", async () => {
    const { ops, calls } = fixture();
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report).toMatchObject({
      chainId: 11155111,
      blockNumber: "11919946",
      coverage: APPROVAL_COVERAGE,
    });
    expect(report.rows).toHaveLength(4);
    expect(calls.filter((call) => call.startsWith("allowance:"))).toHaveLength(
      4,
    );
    expect(calls.every((call) => !/send|sign|approve|revoke/i.test(call))).toBe(
      true,
    );
    expect(report.rows[0]).toMatchObject({
      state: "nonzero",
      rawAllowance: "10000000",
      readableAllowance: "10",
      rawBalance: "270299154",
      readableBalance: "270.299154",
      verifiedDecimals: 6,
    });
    expect(report.rows.slice(1).map((row) => row.state)).toEqual([
      "zero",
      "zero",
      "zero",
    ]);
    expect(report.rows[2].readableBalance).toBe("0");
  });

  it("rejects invalid addresses before any RPC call", async () => {
    const { ops, calls } = fixture();
    await expect(
      inspectTokenApprovals("not-an-address", ops, () => observed),
    ).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
    expect(calls).toEqual([]);
  });

  it("rejects a wrong chain before reading contracts", async () => {
    const { ops, calls } = fixture({ chainId: async () => 1 });
    await expect(
      inspectTokenApprovals(owner, ops, () => observed),
    ).rejects.toMatchObject({ code: "WRONG_CHAIN" });
    expect(calls).toEqual([]);
  });

  it("preserves a uint256-sized allowance without Number rounding", async () => {
    const { ops, values } = fixture();
    const large = (1n << 256n) - 1n;
    values.set(
      key(APPROVAL_TOKENS[0].address, APPROVAL_SPENDERS[0].address),
      large,
    );
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report.rows[0].rawAllowance).toBe(large.toString());
    expect(report.rows[0].readableAllowance).toMatch(
      /^115792089237316195423570985008687907853269984665640564039457584007913129\.639935$/,
    );
  });

  it("marks a token with incorrect decimals unavailable without trusting its allowance", async () => {
    const { ops } = fixture({ decimals: async () => 18 });
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report.rows.slice(0, 2).map((row) => row.issue)).toEqual([
      "DECIMALS_MISMATCH",
      "DECIMALS_MISMATCH",
    ]);
    expect(
      report.rows.slice(0, 2).every((row) => row.rawAllowance === null),
    ).toBe(true);
    expect(report.rows.slice(2).every((row) => row.state === "zero")).toBe(
      true,
    );
  });

  it("rejects a mismatched spender response and refuses unknown export coverage", async () => {
    const { ops } = fixture({
      allowance: async (token, _account, spender) => ({
        token,
        spender:
          spender === APPROVAL_SPENDERS[0].address
            ? (APPROVAL_SPENDERS[1].address as Address)
            : spender,
        value: 10_000_000n,
      }),
    });
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report.rows[0]).toMatchObject({
      state: "unavailable",
      issue: "ALLOWANCE_IDENTITY_MISMATCH",
    });
    expect(() =>
      approvalReportJSON({
        ...report,
        rows: report.rows.map((row, index) =>
          index === 0 ? { ...row, spenderAddress: owner as Address } : row,
        ),
      }),
    ).toThrow("INVALID_APPROVAL_REPORT");
  });

  it("marks missing spender code unavailable for only its two pairs", async () => {
    const { ops } = fixture({
      code: async (address) =>
        address.toLowerCase() === APPROVAL_SPENDERS[0].address.toLowerCase()
          ? "0x"
          : "0x6000",
    });
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(
      report.rows.filter((row) => row.issue === "SPENDER_CODE_UNAVAILABLE"),
    ).toHaveLength(2);
    expect(report.rows.filter((row) => row.state === "zero")).toHaveLength(2);
  });

  it("never trusts allowances for a token without deployed code", async () => {
    const { ops } = fixture({
      code: async (address) =>
        address.toLowerCase() === APPROVAL_TOKENS[0].address.toLowerCase()
          ? undefined
          : "0x6000",
    });
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report.rows.slice(0, 2).map((row) => row.issue)).toEqual([
      "TOKEN_CODE_UNAVAILABLE",
      "TOKEN_CODE_UNAVAILABLE",
    ]);
    expect(report.rows.slice(2).every((row) => row.state === "zero")).toBe(
      true,
    );
  });

  it("keeps other rows usable after one RPC timeout", async () => {
    const { ops } = fixture({
      allowance: async (token, _account, spender) => {
        if (
          token === APPROVAL_TOKENS[0].address &&
          spender === APPROVAL_SPENDERS[0].address
        )
          throw Error("TIMEOUT");
        return { token, spender, value: 0n };
      },
    });
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report.rows[0]).toMatchObject({
      state: "unavailable",
      issue: "ALLOWANCE_UNAVAILABLE",
    });
    expect(report.rows.slice(1).every((row) => row.state === "zero")).toBe(
      true,
    );
  });

  it("reports balance failure separately from an independently readable allowance", async () => {
    const { ops } = fixture({
      balance: async () => {
        throw Error("TIMEOUT");
      },
    });
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    expect(report.rows[0]).toMatchObject({
      state: "nonzero",
      rawAllowance: "10000000",
      rawBalance: null,
      balanceIssue: "BALANCE_UNAVAILABLE",
    });
  });

  it("rejects stale or future block timestamps", async () => {
    const { ops } = fixture({
      block: async () => ({
        number: 1n,
        timestamp: BigInt(
          Math.floor((observed - MAX_BLOCK_AGE_MS - 1000) / 1000),
        ),
      }),
    });
    await expect(
      inspectTokenApprovals(owner, ops, () => observed),
    ).rejects.toMatchObject({ code: "STALE_BLOCK" });
    const future = fixture({
      block: async () => ({
        number: 1n,
        timestamp: BigInt(Math.floor((observed + 31_000) / 1000)),
      }),
    });
    await expect(
      inspectTokenApprovals(owner, future.ops, () => observed),
    ).rejects.toMatchObject({ code: "STALE_BLOCK" });
  });

  it("does not turn a block/RPC failure into a zero-allowance claim", async () => {
    const { ops } = fixture({
      block: async () => {
        throw Error("TIMEOUT");
      },
    });
    await expect(
      inspectTokenApprovals(owner, ops, () => observed),
    ).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
  });

  it("exports all exact read-only identities, integer fields and coverage locally", async () => {
    const { ops } = fixture();
    const report = await inspectTokenApprovals(owner, ops, () => observed);
    const text = approvalReportJSON(report);
    const decoded = JSON.parse(text);
    expect(decoded).toEqual(report);
    expect(decoded.rows[0].rawAllowance).toBe("10000000");
    expect(decoded.rows[0].readableAllowance).toBe("10");
    expect(decoded.rows[0].verifiedDecimals).toBe(6);
    expect(decoded.rows[0].spenderAddress).toBe(APPROVAL_SPENDERS[0].address);
    expect(decoded.coverage).toBe(APPROVAL_COVERAGE);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("does not expose an arbitrary token or spender query surface", async () => {
    const { ops, calls } = fixture();
    await inspectTokenApprovals(owner, ops, () => observed);
    const expected = new Set(
      APPROVAL_TOKENS.flatMap((token) =>
        APPROVAL_SPENDERS.map(
          (spender) => `allowance:${token.address}:${spender.address}:11919946`,
        ),
      ),
    );
    expect(
      new Set(calls.filter((call) => call.startsWith("allowance:"))),
    ).toEqual(expected);
  });
});
