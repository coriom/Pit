import { expect, it } from "vitest";
import {
  bpsToTenths,
  builderConfig,
  builderRate,
  capBuilderFee,
  validateOrderNumbers,
} from "../src/lib/hyperliquid";
it("converts tenths exactly and enforces perps and spot caps", () => {
  expect(bpsToTenths("0.1")).toBe(1);
  expect(bpsToTenths("10")).toBe(100);
  expect(builderRate(100)).toBe("0.1%");
  expect(bpsToTenths("100", "spot")).toBe(1000);
  for (const n of ["10.1", "-1", "NaN", "0.01"])
    expect(() => bpsToTenths(n)).toThrow();
  expect(() => capBuilderFee(1001, "spot")).toThrow();
  expect(() => capBuilderFee(1.5)).toThrow();
  expect(builderConfig()).toBeUndefined();
});
it("rejects invalid order precision", () => {
  expect(() => validateOrderNumbers("65000", "0.001", 5)).not.toThrow();
  expect(() => validateOrderNumbers("65000.1", "0.001", 5)).toThrow();
  expect(() => validateOrderNumbers("1", "0.000001", 5)).toThrow();
  expect(() => validateOrderNumbers("0", "1", 5)).toThrow();
});
