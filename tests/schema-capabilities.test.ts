import { expect, it } from "vitest";
import { assertEvent, eventsCSV } from "../src/lib/events";
const spot = {
  version: 1,
  id: "schema-capability",
  type: "trade",
  timestamp: "2026-09-29T12:00:00Z",
  sequence: 0,
  asset: "ETH",
  quantity: "1",
  counter_asset: "USDC",
  counter_quantity: "2000",
  fee: [],
  source: "pit:cow:11155111",
  account: "public-fixture",
  raw_row_ref: "schema-capability",
};
it("exact upstream additionalProperties forbids typed derivative contract fields", () => {
  for (const field of [
    "instrument_id",
    "position_id",
    "side",
    "position_before",
    "position_after",
    "realized_pnl",
    "unrealized_pnl",
    "funding",
    "liquidation",
    "taxlot_status",
  ])
    expect(() => assertEvent({ ...spot, [field]: "unsupported" })).toThrow(
      /schema/,
    );
  for (const type of ["perp_open", "perp_close", "funding", "liquidation"])
    expect(() => assertEvent({ ...spot, type })).toThrow(/schema/);
});
it("unsigned decimal constraints cannot represent signed PnL or rebates", () => {
  expect(() => assertEvent({ ...spot, quantity: "-1" })).toThrow(/schema/);
  expect(() =>
    assertEvent({ ...spot, fee: [{ asset: "USDC", quantity: "-0.01" }] }),
  ).toThrow(/schema/);
});
it("schema validity alone permits fabricated asset strings but PIT refuses them", () => {
  const forged = {
    ...spot,
    asset: "HL-PERP:ETH:B",
    counter_asset: "USDC-NOTIONAL",
    source: "pit:hyperliquid:testnet",
  };
  expect(() => assertEvent(forged)).not.toThrow();
  expect(() => eventsCSV([forged as never])).toThrow(
    "unsupported_derivative_v1",
  );
});
