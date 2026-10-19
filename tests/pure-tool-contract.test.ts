import { describe, expect, it } from "vitest";
import {
  PURE_TOOL_CONTRACTS,
  compatiblePorts,
  portfolioExposureContract,
  runPureTool,
  swapCostContract,
  type ToolPort,
} from "../src/lib/pure-tool-contract";
import { calculateSwapCost, type SwapCostInput } from "../src/lib/swap-cost";
import {
  calculatePortfolio,
  type PositionInput,
} from "../src/lib/portfolio-exposure";

const swap: SwapCostInput = {
  sellToken: "USDC",
  buyToken: "WETH",
  sellDecimals: 6,
  buyDecimals: 18,
  sellAmount: "10",
  quotedBuyAmount: "0.005",
  venue: "cow-like",
  feeCoverage: "included",
  unembeddedVenueFeeBuyAmount: "",
  approvalRequired: "no",
  swapGasUnits: "",
  approvalGasUnits: "",
  gasPriceGwei: "",
  nativeGasToken: "ETH",
  nativeToBuyRate: "",
  slippageBps: 50,
};
const now = "2026-10-16T12:00:00Z";
const position: PositionInput = {
  accountLabel: "Sample",
  chainId: 1,
  assetType: "native",
  tokenAddress: "",
  symbol: "ETH",
  decimals: 18,
  quantity: "1",
  unitPriceUsd: "2000",
  priceObservedAt: "2026-10-16T11:00:00Z",
  exposureGroup: "ETH exposure",
};
const portfolioInput = { positions: [position], staleAfterDays: 7 };

describe("versioned pure tool contracts", () => {
  it("allows only the four reviewed local calculator IDs", () => {
    expect(PURE_TOOL_CONTRACTS.map((contract) => contract.id)).toEqual([
      "swap-cost",
      "portfolio-exposure",
      "token-fee-converter",
      "yield-growth",
    ]);
    expect(
      PURE_TOOL_CONTRACTS.every(
        (contract) => contract.capability === "local-pure",
      ),
    ).toBe(true);
    for (const id of [
      "swap",
      "perps",
      "taxlot-export",
      "token-approvals",
      "uniswap-execution",
    ])
      expect(runPureTool(id, {}).status).toBe("ERROR");
  });

  it("preserves exact swap economics and exposes the buy-token raw unit", () => {
    const result = runPureTool("swap-cost", swap);
    expect(result.status).toBe("COMPLETE");
    if (result.status === "ERROR") throw Error(result.error.message);
    expect(result.output).toEqual(calculateSwapCost(swap));
    expect(result.values).toEqual([
      {
        port: {
          name: "netAfterWalletGasRaw",
          valueType: "raw-integer-string",
          unit: {
            kind: "token",
            decimals: 18,
            identity: { kind: "manual-label", label: "weth" },
          },
          required: true,
          sourceToolId: "swap-cost",
          sourceContractVersion: 1,
        },
        value: "5000000000000000",
      },
    ]);
    expect(swapCostContract.version).toBe(1);
    expect(
      result.inputPorts.find((p) => p.name === "gasPriceGwei")?.unit,
    ).toEqual({
      kind: "gwei",
      decimals: 9,
    });
    const manualRate = result.inputPorts.find(
      (p) => p.name === "nativeToBuyRate",
    )!;
    expect(compatiblePorts(manualRate, manualRate)).toBe(false);
  });

  it("preserves incomplete coverage rather than substituting zero", () => {
    const result = runPureTool("swap-cost", {
      ...swap,
      feeCoverage: "unknown",
    });
    expect(result.status).toBe("INCOMPLETE");
    if (result.status === "ERROR") throw Error(result.error.message);
    expect(result.values[0]?.value).toBeNull();
  });

  it("rejects malformed swap shape and engine-invalid values before a result", () => {
    for (const input of [
      null,
      { ...swap, sellDecimals: "6" },
      { ...swap, sellAmount: "-1" },
      { ...swap, extra: "unexpected" },
    ]) {
      const result = runPureTool("swap-cost", input);
      expect(result.status).toBe("ERROR");
      if (result.status === "ERROR")
        expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("requires explicit observation time and preserves portfolio arithmetic", () => {
    const missing = runPureTool("portfolio-exposure", portfolioInput);
    expect(missing.status).toBe("ERROR");
    if (missing.status === "ERROR")
      expect(missing.error.code).toBe("INCOMPLETE_INPUTS");
    const result = runPureTool("portfolio-exposure", portfolioInput, {
      observationTimeIso: now,
    });
    expect(result.status).toBe("COMPLETE");
    if (result.status === "ERROR") throw Error(result.error.message);
    expect(result.output).toEqual(
      calculatePortfolio([position], { nowIso: now, staleAfterDays: 7 }),
    );
    expect(result.values[0]?.value).toBe("2000000000000000000000");
    expect(result.values[0]?.port.unit).toEqual({
      kind: "usd-manual",
      decimals: 18,
    });
    expect(result.values[0]?.port.observedAt).toBe("2026-10-16T12:00:00.000Z");
    expect(portfolioExposureContract.version).toBe(1);
  });

  it("rejects malformed rows and duplicate holdings through the existing engine", () => {
    for (const input of [
      { positions: [{ ...position, decimals: "18" }], staleAfterDays: 7 },
      { positions: [position, position], staleAfterDays: 7 },
      { positions: [], staleAfterDays: -1 },
    ]) {
      const result = runPureTool("portfolio-exposure", input, {
        observationTimeIso: now,
      });
      expect(result.status).toBe("ERROR");
      if (result.status === "ERROR")
        expect(result.error.code).toBe("INVALID_INPUT");
    }
  });

  it("keeps unknown-price coverage incomplete without a false portfolio weight", () => {
    const result = runPureTool(
      "portfolio-exposure",
      {
        positions: [
          position,
          {
            ...position,
            accountLabel: "Other",
            quantity: "2",
            unitPriceUsd: "",
            priceObservedAt: "",
          },
        ],
        staleAfterDays: 7,
      },
      { observationTimeIso: now },
    );
    expect(result.status).toBe("INCOMPLETE");
    if (result.status === "ERROR") throw Error(result.error.message);
    expect(result.output.knownSubtotalUsdRaw).toBe("2000000000000000000000");
    expect(result.output.largestPositionWeightPpm).toBeNull();
  });

  it("accepts only exact compatible value types, units and asset identities", () => {
    const swapResult = runPureTool("swap-cost", swap);
    if (swapResult.status === "ERROR") throw Error(swapResult.error.message);
    const source = swapResult.values[0]!.port;
    const same: ToolPort = {
      ...source,
      name: "incomingRawAmount",
      sourceToolId: "another-local-tool",
    };
    expect(compatiblePorts(source, same)).toBe(false); // Matching manual tickers are insufficient.
    expect(
      compatiblePorts(source, { ...same, valueType: "decimal-string" }),
    ).toBe(false);
    expect(
      compatiblePorts(source, {
        ...same,
        unit: {
          kind: "token",
          decimals: 6,
          identity: { kind: "manual-label", label: "weth" },
        },
      }),
    ).toBe(false);
    expect(
      compatiblePorts(source, {
        ...same,
        unit: {
          kind: "token",
          decimals: 18,
          identity: { kind: "manual-label", label: "eth" },
        },
      }),
    ).toBe(false);
    expect(
      compatiblePorts(source, {
        ...same,
        unit: {
          kind: "token",
          decimals: 18,
          identity: {
            kind: "chain-scoped",
            chainId: 1,
            assetType: "erc20",
            address: "0x1111111111111111111111111111111111111111",
          },
        },
      }),
    ).toBe(false);
    const valued = runPureTool("portfolio-exposure", portfolioInput, {
      observationTimeIso: now,
    });
    if (valued.status === "ERROR") throw Error(valued.error.message);
    const usdOutput = valued.values[0]!.port;
    const usdInput: ToolPort = {
      ...usdOutput,
      name: "manualUsdAmountRaw",
      sourceToolId: "future-local-report",
    };
    expect(compatiblePorts(usdOutput, usdInput)).toBe(true);
    expect(
      compatiblePorts(usdOutput, {
        ...usdInput,
        observedAt: "2026-10-17T00:00:00Z",
      }),
    ).toBe(false);
    expect(
      compatiblePorts(usdOutput, { ...usdInput, sourceContractVersion: 2 }),
    ).toBe(false);
    const chainToken: ToolPort = {
      ...source,
      unit: {
        kind: "token",
        decimals: 6,
        identity: {
          kind: "chain-scoped",
          chainId: 11155111,
          assetType: "erc20",
          address: "0x1111111111111111111111111111111111111111",
        },
      },
    };
    expect(
      compatiblePorts(chainToken, { ...chainToken, name: "incomingRawAmount" }),
    ).toBe(true);
    expect(
      compatiblePorts(chainToken, {
        ...chainToken,
        unit: {
          kind: "token",
          decimals: 6,
          identity: {
            kind: "chain-scoped",
            chainId: 84532,
            assetType: "erc20",
            address: "0x1111111111111111111111111111111111111111",
          },
        },
      }),
    ).toBe(false);
  });
});
