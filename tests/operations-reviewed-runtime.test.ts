import { describe, expect, it } from "vitest";
import { scheduleRuntime } from "../src/operations/generated/schedule-runtime";
import { matchesReviewedRuntime } from "../src/operations/lib/reviewed-runtime";
import type { Hex } from "viem";

describe("constructor-immutable runtime comparison", () => {
  it("accepts reviewed code and constructor immutable values", () => {
    const item = scheduleRuntime.PitTokenLock;
    expect(matchesReviewedRuntime(item.code as Hex, item)).toBe(true);
    const [reference] = Object.values(item.immutableReferences).flat();
    expect(reference).toBeDefined();
    const at = 2 + reference.start * 2;
    const changed = `${item.code.slice(0, at)}${item.code.slice(at, at + 2) === "00" ? "01" : "00"}${item.code.slice(at + 2)}` as Hex;
    expect(matchesReviewedRuntime(changed, item)).toBe(true);
  });
  it("rejects a changed opcode or length outside immutable offsets", () => {
    const item = scheduleRuntime.PitTokenVesting;
    const changed = `0x00${item.code.slice(4)}` as Hex;
    expect(matchesReviewedRuntime(changed, item)).toBe(false);
    expect(matchesReviewedRuntime("0x" as Hex, item)).toBe(false);
  });
});
