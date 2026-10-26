import type { Hex } from "viem";

export type ReviewedRuntime = {
  code: Hex;
  immutableReferences: Record<string, readonly { start: number; length: number }[]>;
};

/** Compare every runtime byte except compiler-declared constructor immutables. */
export function matchesReviewedRuntime(actual: Hex | undefined, reviewed: ReviewedRuntime): boolean {
  if (!actual || actual.length !== reviewed.code.length || !/^0x(?:[0-9a-fA-F]{2})+$/.test(actual)) return false;
  const bytes = (actual.length - 2) / 2;
  const ignored = new Uint8Array(bytes);
  for (const refs of Object.values(reviewed.immutableReferences)) {
    for (const { start, length } of refs) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || start < 0 || length < 1 || start + length > bytes) return false;
      ignored.fill(1, start, start + length);
    }
  }
  for (let index = 0; index < bytes; index++) {
    if (!ignored[index] && actual.slice(2 + index * 2, 4 + index * 2).toLowerCase() !== reviewed.code.slice(2 + index * 2, 4 + index * 2).toLowerCase()) return false;
  }
  return true;
}
