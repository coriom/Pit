import { describe, expect, it } from "vitest";
import {
  calculateVesting,
  vestingReportJSON,
  type VestingInput,
} from "../src/lib/vesting-unlocks";
const linear: VestingInput = {
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
const initial: VestingInput = {
  ...linear,
  mode: "initial-linear",
  initialBps: "1000",
};
const tranches: VestingInput = {
  mode: "tranches",
  tokenLabel: "TOKEN",
  decimals: 6,
  totalAllocation: "1000",
  startDate: "2026-01-01",
  endDate: "2026-07-01",
  observationDate: "2026-05-01",
  previouslyReceived: "100",
  tranches: [
    { date: "2026-01-01", amount: "100" },
    { date: "2026-04-01", amount: "300" },
    { date: "2026-07-01", amount: "600" },
  ],
};
const display = (result: ReturnType<typeof calculateVesting>, name: string) =>
  result.fields.find((item) => item.name === name)!.display;

describe("manual UTC token vesting", () => {
  it("gates accrued linear tokens at the cliff and conserves the end allocation", () => {
    const before = calculateVesting({
      ...linear,
      observationDate: "2026-03-31",
    });
    expect(display(before, "vestedAllocation")).toBe("0");
    const cliff = calculateVesting({
      ...linear,
      observationDate: "2026-04-01",
    });
    expect(
      BigInt(
        cliff.fields.find((item) => item.name === "vestedAllocation")!.raw,
      ),
    ).toBeGreaterThan(0n);
    const end = calculateVesting({ ...linear, observationDate: "2027-01-01" });
    expect(display(end, "vestedAllocation")).toBe("10000");
    expect(display(end, "lockedAllocation")).toBe("0");
    expect(
      display(
        calculateVesting({ ...linear, observationDate: "2025-12-31" }),
        "vestedAllocation",
      ),
    ).toBe("0");
  });
  it("adds an immediate share once and vests the exact remainder", () => {
    const start = calculateVesting({
      ...initial,
      observationDate: "2026-01-01",
    });
    expect(display(start, "initialUnlockAllocation")).toBe("1000");
    expect(display(start, "remainingLinearAllocation")).toBe("9000");
    expect(display(start, "vestedAllocation")).toBe("1000");
    const end = calculateVesting({ ...initial, observationDate: "2027-01-01" });
    expect(display(end, "vestedAllocation")).toBe("10000");
  });
  it("aggregates exact dated tranches, next event and unreceived balance", () => {
    const result = calculateVesting(tranches);
    expect(display(result, "vestedAllocation")).toBe("400");
    expect(display(result, "lockedAllocation")).toBe("600");
    expect(display(result, "vestedButNotReceived")).toBe("300");
    expect(result.nextUnlockDate).toBe("2026-07-01");
    expect(result.nextUnlockAmountRaw).toBe("600000000");
    expect(result.schedule.map((item) => item.status)).toEqual([
      "unlocked",
      "unlocked",
      "future",
    ]);
    expect(JSON.parse(vestingReportJSON(result)).schedule[2].amountRaw).toBe(
      "600000000",
    );
  });
  it("rejects invalid dates, claims and unscheduled allocation", () => {
    expect(() =>
      calculateVesting({ ...linear, cliffDate: "2025-12-31" }),
    ).toThrow(/Cliff/);
    expect(() =>
      calculateVesting({ ...linear, cliffDate: "2028-01-01" }),
    ).toThrow(/Cliff/);
    expect(() =>
      calculateVesting({ ...linear, observationDate: "2026-02-30" }),
    ).toThrow(/calendar/);
    expect(() =>
      calculateVesting({ ...linear, previouslyReceived: "10000" }),
    ).toThrow(/cannot exceed/);
    expect(() =>
      calculateVesting({ ...tranches, totalAllocation: "999" }),
    ).toThrow(/exactly equal/);
    expect(() =>
      calculateVesting({
        ...tranches,
        tranches: [tranches.tranches[1], tranches.tranches[0]],
      }),
    ).toThrow(/increasing/);
  });
  it("handles leap days and raw-unit floors without losing the final token", () => {
    const small: VestingInput = {
      mode: "linear",
      tokenLabel: "T",
      decimals: 0,
      totalAllocation: "3",
      startDate: "2024-02-28",
      endDate: "2024-03-01",
      cliffDate: "",
      observationDate: "2024-02-29",
      previouslyReceived: "",
    };
    expect(display(calculateVesting(small), "vestedAllocation")).toBe("1");
    expect(
      display(
        calculateVesting({ ...small, observationDate: "2024-03-01" }),
        "vestedAllocation",
      ),
    ).toBe("3");
    expect(calculateVesting({ ...small, totalAllocation: "0" }).status).toBe(
      "incomplete",
    );
    expect(() =>
      calculateVesting({ ...small, totalAllocation: "1.1" }),
    ).toThrow();
  });
  it("preserves allocation conservation over bounded observation dates", () => {
    for (const day of [
      "2024-02-27",
      "2024-02-28",
      "2024-02-29",
      "2024-03-01",
      "2024-03-02",
    ]) {
      const input: VestingInput = {
        mode: "initial-linear",
        tokenLabel: "T",
        decimals: 0,
        totalAllocation: "7",
        startDate: "2024-02-28",
        endDate: "2024-03-01",
        cliffDate: "2024-02-29",
        initialBps: "1429",
        observationDate: day,
        previouslyReceived: "",
      };
      const result = calculateVesting(input);
      const get = (name: string) =>
        BigInt(result.fields.find((item) => item.name === name)!.raw);
      expect(get("vestedAllocation") + get("lockedAllocation")).toBe(7n);
      expect(get("vestedAllocation")).toBeGreaterThanOrEqual(0n);
      expect(get("vestedAllocation")).toBeLessThanOrEqual(7n);
    }
  });
});
