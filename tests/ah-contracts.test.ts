import { describe, expect, it } from "vitest";
import {
  PURE_TOOL_CONTRACTS,
  compatiblePorts,
  runPureTool,
} from "../src/lib/pure-tool-contract";

describe("Phase AH closed pure-local composition boundary", () => {
  it("retains the reviewed local allowlist and keeps execution IDs rejected", () => {
    expect(PURE_TOOL_CONTRACTS.map((item) => item.id)).toEqual([
      "swap-cost",
      "portfolio-exposure",
      "token-fee-converter",
      "yield-growth",
      "trade-risk",
      "execution-math",
      "portfolio-rebalance",
      "performance-drawdown",
    ]);
    for (const id of ["swap", "perps", "taxlot-export", "token-approvals"])
      expect(runPureTool(id, {}).status).toBe("ERROR");
  });
  it("separates APR, APY and periodic rate output units", () => {
    const apr = runPureTool("yield-growth", {
      mode: "apy-to-apr",
      apyPercent: "5",
      periodsPerYear: 12,
    });
    const apy = runPureTool("yield-growth", {
      mode: "apr-to-apy",
      aprPercent: "5",
      periodsPerYear: 12,
    });
    const periodic = runPureTool("yield-growth", {
      mode: "periodic-to-annual",
      periodicPercent: "1",
      periodsPerYear: 12,
    });
    if (
      apr.status === "ERROR" ||
      apy.status === "ERROR" ||
      periodic.status === "ERROR"
    )
      throw Error("Unexpected contract rejection");
    expect(compatiblePorts(apr.values[1].port, apy.values[1].port)).toBe(false);
    expect(compatiblePorts(periodic.values[0].port, apy.values[1].port)).toBe(
      false,
    );
    expect(compatiblePorts(apr.inputPorts[0], apr.values[1].port)).toBe(false);
  });
  it("does not infer identity from matching manual currency or token labels", () => {
    const money = runPureTool("yield-growth", {
      mode: "simple",
      principal: "100",
      annualRatePercent: "5",
      years: 1,
      currency: "USD",
    });
    const token = runPureTool("token-fee-converter", {
      mode: "token",
      amount: "100",
      direction: "human-to-raw",
      decimals: 18,
      tokenLabel: "USD",
    });
    if (money.status === "ERROR" || token.status === "ERROR")
      throw Error("Unexpected contract rejection");
    expect(compatiblePorts(money.values[0].port, money.values[3].port)).toBe(
      false,
    );
    expect(compatiblePorts(money.values[0].port, token.values[0].port)).toBe(
      false,
    );
  });
  it("keeps denomination conversion explicit", () => {
    const eth = runPureTool("token-fee-converter", {
      mode: "native",
      amount: "1",
      unit: "eth",
    });
    const gwei = runPureTool("token-fee-converter", {
      mode: "native",
      amount: "1",
      unit: "gwei",
    });
    if (eth.status === "ERROR" || gwei.status === "ERROR")
      throw Error("Unexpected contract rejection");
    expect(compatiblePorts(eth.inputPorts[0], gwei.inputPorts[0])).toBe(false);
    expect(eth.values[0].port.unit).toEqual({ kind: "wei", decimals: 0 });
  });
});
