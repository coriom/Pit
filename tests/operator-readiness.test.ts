import { expect, it } from "vitest";
import {
  cowOperatorReadiness,
  operatorActionAllowed,
  perpOperatorReadiness,
} from "../src/lib/operator-readiness";

const cow = {
  connected: true,
  chainId: 11155111,
  feesEnabled: false,
  mainnetEnabled: false,
  storage: true,
  sellToken: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
  buyToken: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  gate: "GREEN" as const,
  quotePresent: true,
  quoteDiagnostic: false,
  quoteObtainedAt: 100_000,
  now: 120_000,
};
const status = (items: ReturnType<typeof cowOperatorReadiness>, id: string) =>
  items.find((entry) => entry.id === id)?.status;

it("CoW readiness fails wrong chain, insufficient balance, fees and unsafe origin", () => {
  expect(status(cowOperatorReadiness(cow), "quote")).toBe("PASS");
  expect(
    status(
      cowOperatorReadiness({ ...cow, chainId: 84532, gate: "WRONG_CHAIN" }),
      "chain",
    ),
  ).toBe("FAIL");
  expect(
    status(cowOperatorReadiness({ ...cow, gate: "WRONG_CHAIN" }), "chain"),
  ).toBe("FAIL");
  expect(
    status(
      cowOperatorReadiness({ ...cow, gate: "INSUFFICIENT_BALANCE" }),
      "funds",
    ),
  ).toBe("FAIL");
  expect(
    status(
      cowOperatorReadiness({ ...cow, feesEnabled: true, gate: "FEES_ENABLED" }),
      "fees",
    ),
  ).toBe("FAIL");
  expect(
    status(
      cowOperatorReadiness({
        ...cow,
        storage: false,
        gate: "STORAGE_UNAVAILABLE",
      }),
      "storage",
    ),
  ).toBe("FAIL");
  expect(
    status(
      cowOperatorReadiness({ ...cow, gate: "STORAGE_UNAVAILABLE" }),
      "storage",
    ),
  ).toBe("FAIL");
});

it("diagnostic, absent, stale and invalid CoW quotes never satisfy executable readiness", () => {
  for (const f of [
    { ...cow, quoteDiagnostic: true },
    { ...cow, quotePresent: false },
    { ...cow, now: 160_000 },
    { ...cow, gate: "QUOTE_EXPIRED" as const },
    { ...cow, gate: "INVALID_EXECUTION_QUOTE" as const },
  ])
    expect(status(cowOperatorReadiness(f), "quote")).toBe("FAIL");
  expect(
    status(cowOperatorReadiness({ ...cow, gate: "READ_FAILED" }), "quote"),
  ).toBe("UNKNOWN");
});

it("Hyperliquid discloses raw-only derivative accounting and fails closed", () => {
  const base = {
    connected: true,
    feesEnabled: false,
    mainnetEnabled: false,
    storage: true,
    testnetEnvironment: true,
    gate: "GREEN" as const,
    marketSelected: true,
  };
  const ready = perpOperatorReadiness(base);
  expect(status(ready, "environment")).toBe("PASS");
  expect(ready.find((entry) => entry.id === "accounting")?.detail).toContain(
    "unsupported_derivative_v1",
  );
  expect(
    status(
      perpOperatorReadiness({
        ...base,
        testnetEnvironment: false,
        gate: "HL_CONFIGURATION",
      }),
      "environment",
    ),
  ).toBe("FAIL");
  expect(
    status(
      perpOperatorReadiness({ ...base, gate: "INSUFFICIENT_BALANCE" }),
      "collateral",
    ),
  ).toBe("FAIL");
  expect(
    status(perpOperatorReadiness({ ...base, feesEnabled: true }), "fees"),
  ).toBe("FAIL");
});

it("an action requires a green gate and explicit operator checkpoint; dry run never authorizes it", () => {
  expect(operatorActionAllowed(false, "GREEN", false)).toBe(false);
  expect(operatorActionAllowed(false, "INSUFFICIENT_BALANCE", true)).toBe(
    false,
  );
  expect(operatorActionAllowed(true, "GREEN", true)).toBe(false);
  expect(operatorActionAllowed(false, "GREEN", true)).toBe(true);
});
