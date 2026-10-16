import { describe, expect, it } from "vitest";
import {
  CSV_HEADER,
  MAX_CSV_BYTES,
  calculatePortfolio,
  formatHhi,
  formatPercent,
  normalizePosition,
  parsePortfolioCSV,
  portfolioReportJSON,
  type PositionInput,
} from "../src/lib/portfolio-exposure";

const NOW = "2026-10-16T12:00:00Z";
const AT = "2026-10-16T11:00:00Z";
const TOKEN_A = "0x1111111111111111111111111111111111111111";
const TOKEN_B = "0x2222222222222222222222222222222222222222";
const base = (overrides: Partial<PositionInput> = {}): PositionInput => ({
  accountLabel: "A",
  chainId: 1,
  assetType: "native",
  tokenAddress: "",
  symbol: "ETH",
  decimals: 18,
  quantity: "1",
  unitPriceUsd: "2000",
  priceObservedAt: AT,
  exposureGroup: "ETH exposure",
  ...overrides,
});
const calc = (rows: PositionInput[], staleAfterDays = 7) =>
  calculatePortfolio(rows, { nowIso: NOW, staleAfterDays });
const sample = () => [
  base(),
  base({
    accountLabel: "B",
    chainId: 8453,
    assetType: "erc20",
    tokenAddress: TOKEN_A,
    symbol: "USDC",
    decimals: 6,
    quantity: "500",
    unitPriceUsd: "1",
    exposureGroup: "Stablecoin exposure",
  }),
  base({
    accountLabel: "C",
    chainId: 42161,
    assetType: "erc20",
    tokenAddress: TOKEN_B,
    symbol: "WETH",
    quantity: "0.25",
  }),
];

describe("manual portfolio exposure", () => {
  it("calculates the independent $3,000 example and exact allocations", () => {
    const result = calc(sample());
    expect(result.status).toBe("COMPLETE");
    expect(result.knownSubtotalUsdRaw).toBe("3000000000000000000000");
    expect(result.positions.map((p) => p.valueUsdRaw)).toEqual([
      "2000000000000000000000",
      "500000000000000000000",
      "500000000000000000000",
    ]);
    expect(result.byChain.map((p) => p.valueUsdRaw)).toEqual([
      "2000000000000000000000",
      "500000000000000000000",
      "500000000000000000000",
    ]);
    expect(
      result.byGroup.find((g) => g.identity === "ETH exposure")?.valueUsdRaw,
    ).toBe("2500000000000000000000");
    expect(
      result.byGroup.find((g) => g.identity === "ETH exposure")?.weightPpm,
    ).toBe("833333");
    expect(formatPercent(result.largestPositionWeightPpm)).toBe("66.6667%");
    expect(formatPercent(result.topThreeWeightPpm)).toBe("100%");
    expect(formatHhi(result.hhiMicro)).toBe("5000");
  });
  it("keeps same tickers on different chains distinct and only groups ETH/WETH explicitly", () => {
    const rows = sample();
    rows[2].exposureGroup = "Wrapped token";
    const result = calc(rows);
    expect(result.byAsset).toHaveLength(3);
    expect(
      result.byGroup.find((g) => g.identity === "ETH exposure")?.valueUsdRaw,
    ).toBe("2000000000000000000000");
  });
  it("keeps unknown prices outside known subtotal and removes whole-portfolio weights", () => {
    const result = calc([
      ...sample(),
      base({
        accountLabel: "D",
        assetType: "erc20",
        tokenAddress: TOKEN_A,
        symbol: "MYST",
        quantity: "1",
        unitPriceUsd: "",
        priceObservedAt: "",
        exposureGroup: "",
      }),
    ]);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.knownSubtotalUsdRaw).toBe("3000000000000000000000");
    expect(result.unpricedCount).toBe(1);
    expect(result.largestPositionWeightPpm).toBeNull();
    expect(result.hhiMicro).toBeNull();
    expect(result.byGroup.every((group) => group.weightPpm === null)).toBe(
      true,
    );
  });
  it("never calls an empty input a complete valued portfolio", () => {
    const result = calc([]);
    expect(result.status).toBe("EMPTY");
    expect(result.largestPositionWeightPpm).toBeNull();
    expect(result.hhiMicro).toBeNull();
  });
  it("flags stale manual prices without falsely fetching a replacement", () => {
    expect(
      calc([base({ priceObservedAt: "2026-10-01T00:00:00Z" })]).staleCount,
    ).toBe(1);
    expect(calc([base()], 0).staleCount).toBe(1);
  });
  it("uses integer precision across decimals and half-up USD rounding", () => {
    const p = normalizePosition(
      base({
        assetType: "erc20",
        tokenAddress: TOKEN_A,
        decimals: 6,
        quantity: "0.000001",
        unitPriceUsd: "0.000000000000000001",
      }),
      Date.parse(NOW),
      7,
    );
    expect(p.quantityRaw).toBe("1");
    expect(p.unitPriceUsdRaw).toBe("1");
    expect(p.valueUsdRaw).toBe("0");
    const q = normalizePosition(
      base({
        assetType: "erc20",
        tokenAddress: TOKEN_A,
        decimals: 1,
        quantity: "0.1",
        unitPriceUsd: "0.000000000000000005",
      }),
      Date.parse(NOW),
      7,
    );
    expect(q.valueUsdRaw).toBe("1");
  });
  it("detects duplicate account/chain/token rows rather than double-counting", () => {
    expect(() =>
      calc([base(), base({ accountLabel: "a", symbol: "OTHER" })]),
    ).toThrow(/duplicate/);
  });
  it("rejects conflicting prices for one chain-scoped asset", () => {
    expect(() =>
      calc([base(), base({ accountLabel: "B", unitPriceUsd: "2001" })]),
    ).toThrow(/conflicting/);
    expect(() =>
      calc([
        base({ assetType: "erc20", tokenAddress: TOKEN_A }),
        base({
          accountLabel: "B",
          assetType: "erc20",
          tokenAddress: TOKEN_A,
          decimals: 6,
        }),
      ]),
    ).toThrow(/conflicting decimals/);
  });
  it("rejects bad identity, negative quantity, excess precision and future prices", () => {
    expect(() => calc([base({ chainId: 999 })])).toThrow(/chain ID/);
    expect(() =>
      calc([base({ assetType: "erc20", tokenAddress: "0x1" })]),
    ).toThrow(/address/);
    expect(() => calc([base({ decimals: 6 })])).toThrow(/18 decimals/);
    expect(() => calc([base({ quantity: "-1" })])).toThrow(/nonnegative/);
    expect(() => calc([base({ quantity: "0.0000000000000000001" })])).toThrow(
      /precision/,
    );
    expect(() =>
      calc([base({ priceObservedAt: "2026-11-01T00:00:00Z" })]),
    ).toThrow(/future/);
  });
  it("does not infer a $1 USDC peg or a shared ETH/WETH price", () => {
    const result = calc([
      base({ symbol: "USDC", unitPriceUsd: "", priceObservedAt: "" }),
    ]);
    expect(result.status).toBe("INCOMPLETE");
    expect(result.knownSubtotalUsdRaw).toBe("0");
  });
  it("handles large supported BigInt amounts without floating point", () => {
    const result = calc([
      base({ quantity: "1000000000000000000", unitPriceUsd: "1" }),
    ]);
    expect(result.knownSubtotalUsdRaw).toBe(
      "1000000000000000000000000000000000000",
    );
  });
  it("preserves raw values, identities and limitations in local JSON", () => {
    const json = JSON.parse(portfolioReportJSON(calc(sample())));
    expect(json.calculationVersion).toBe("pit.portfolio-exposure.manual.v1");
    expect(json.positions[2].assetIdentity).toBe(`42161:erc20:${TOKEN_B}`);
    expect(json.positions[2].quantityRaw).toBe("250000000000000000");
    expect(json.disclaimer).toContain("no live data");
  });
});

describe("local CSV import", () => {
  const line = (account = "A") =>
    `"${account}",1,native,,ETH,18,1,2000,${AT},"ETH exposure"`;
  it("parses UTF-8 BOM, quoted commas and CRLF", () => {
    const result = parsePortfolioCSV(
      `\uFEFF${CSV_HEADER}\r\n${line("Wallet, primary")}\r\n`,
      Date.parse(NOW),
    );
    expect(result.errors).toEqual([]);
    expect(result.rows[0].accountLabel).toBe("Wallet, primary");
  });
  it("returns per-row errors and valid preview rows without accepting any data", () => {
    const result = parsePortfolioCSV(
      `${CSV_HEADER}\n${line()}\nB,1,erc20,wrong,X,18,1,1,${AT},X\n`,
      Date.parse(NOW),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Row 2");
  });
  it("rejects malformed header, quotes, unsafe size and row count", () => {
    expect(() => parsePortfolioCSV("a,b\n1,2")).toThrow(/header/);
    expect(() => parsePortfolioCSV(`${CSV_HEADER}\n"bad`)).toThrow(/Unclosed/);
    expect(() => parsePortfolioCSV("x".repeat(MAX_CSV_BYTES + 1))).toThrow(
      /256 KiB/,
    );
    expect(() =>
      parsePortfolioCSV(
        `${CSV_HEADER}\n${Array.from({ length: 201 }, (_, i) => line(String(i))).join("\n")}`,
      ),
    ).toThrow(/too many/);
  });
  it("keeps formula-looking text inert", () => {
    const result = parsePortfolioCSV(
      `${CSV_HEADER}\n${line('=HYPERLINK(""bad"")')}`,
      Date.parse(NOW),
    );
    expect(result.rows[0].accountLabel.startsWith("=")).toBe(true);
  });
});
