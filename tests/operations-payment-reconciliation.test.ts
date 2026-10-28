import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { assessPaidReceipt, mergePaidRecord, type PaidExpectation, type PaidObservation, type PaidRecord } from "../src/operations/lib/payment-reconciliation";

const address = (last: string) => `0x${last.padStart(40, "0")}` as Address;
const digest = (byte: string) => `0x${byte.repeat(32)}` as Hex;
const expected: PaidExpectation = {
  chainId: 31337, transactionHash: digest("11"), router: address("a1"), payer: address("b2"),
  paymentToken: address("c3"), feeRecipient: address("d4"), intentId: digest("22"),
  operationCode: digest("33"), requestHash: digest("44"), expectedFee: 3_200_000n,
};
const observed: PaidObservation = {
  chainId: 31337, transactionHash: expected.transactionHash, to: expected.router,
  status: "success", blockHash: digest("55"), canonicalBlockHash: digest("55"),
  blockNumber: 100n, latestBlockNumber: 102n,
  feeLogs: [{ address: expected.router, logIndex: 1, payer: expected.payer,
    recipient: expected.feeRecipient, intentId: expected.intentId, operationCode: expected.operationCode, amount: expected.expectedFee }],
  operationLogs: [{ address: expected.router, logIndex: 3, payer: expected.payer,
    intentId: expected.intentId, operationCode: expected.operationCode, requestHash: expected.requestHash, result: address("e5") }],
  transferLogs: [{ address: expected.paymentToken, logIndex: 2, payer: expected.payer,
    recipient: expected.feeRecipient, amount: expected.expectedFee }],
};
describe("paid receipt reconciliation", () => {
  it("requires canonical confirmations and all three independent matching events", () => {
    expect(assessPaidReceipt(expected, null).status).toBe("PENDING");
    expect(assessPaidReceipt(expected, observed, 3n)).toMatchObject({ status: "CONFIRMED", confirmations: 3n });
    expect(assessPaidReceipt(expected, { ...observed, latestBlockNumber: 101n }, 3n).status).toBe("PENDING");
    expect(assessPaidReceipt(expected, { ...observed, canonicalBlockHash: digest("66") }).status).toBe("REORGED");
    expect(assessPaidReceipt(expected, { ...observed, latestBlockNumber: 99n }).status).toBe("PENDING");
    expect(() => assessPaidReceipt(expected, observed, 0n)).toThrow();
  });
  it("never counts a failed, mismatched, missing or duplicate fee", () => {
    expect(assessPaidReceipt(expected, { ...observed, status: "reverted" }).status).toBe("REVERTED");
    expect(assessPaidReceipt(expected, { ...observed, chainId: 84532 }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, to: address("ff") }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, feeLogs: [] }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, feeLogs: [...observed.feeLogs, ...observed.feeLogs] }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, transferLogs: [{ ...observed.transferLogs[0], amount: 3_100_000n }] }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, transferLogs: [{ ...observed.transferLogs[0], address: address("ff") }] }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, operationLogs: [{ ...observed.operationLogs[0], requestHash: digest("ee") }] }).status).toBe("MISMATCH");
    expect(assessPaidReceipt(expected, { ...observed, operationLogs: [{ ...observed.operationLogs[0], logIndex: 1 }] }).status).toBe("MISMATCH");
  });
  it("deduplicates exact repeated ingestion and rejects conflicting or replayed evidence", () => {
    const assessment = assessPaidReceipt(expected, observed);
    expect(assessment.status).toBe("CONFIRMED");
    const record: PaidRecord = { chainId: 31337, evidenceKey: assessment.evidenceKey!, blockHash: observed.blockHash,
      transactionHash: expected.transactionHash, intentId: expected.intentId, status: "CONFIRMED" };
    const one = mergePaidRecord([], record);
    expect(mergePaidRecord(one, record)).toBe(one);
    expect(() => mergePaidRecord(one, { ...record, blockHash: digest("99") })).toThrow();
    expect(() => mergePaidRecord(one, { ...record, evidenceKey: "31337:other:2" })).toThrow();
    expect(() => mergePaidRecord(one, { ...record, evidenceKey: "31337:other:2", transactionHash: digest("aa") })).toThrow();
    expect(mergePaidRecord(one, { ...record, chainId: 84532, evidenceKey: "84532:other:2" })).toHaveLength(2);
  });
});
