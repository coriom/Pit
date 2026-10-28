import type { Address, Hex } from "viem";

export type PaidExpectation = Readonly<{
  chainId: number; transactionHash: Hex; router: Address; payer: Address;
  paymentToken: Address; feeRecipient: Address; intentId: Hex;
  operationCode: Hex; requestHash: Hex; expectedFee: bigint;
}>;
export type PaidLog = Readonly<{
  address: Address; logIndex: number; payer?: Address; recipient?: Address;
  intentId?: Hex; operationCode?: Hex; requestHash?: Hex;
  amount?: bigint; result?: Address;
}>;
export type PaidObservation = Readonly<{
  chainId: number; transactionHash: Hex; to: Address | null;
  status: "success" | "reverted"; blockHash: Hex; blockNumber: bigint;
  canonicalBlockHash: Hex | null; latestBlockNumber: bigint;
  feeLogs: readonly PaidLog[]; operationLogs: readonly PaidLog[];
  transferLogs: readonly PaidLog[];
}>;
export type PaidAssessment = Readonly<{
  status: "CONFIRMED" | "PENDING" | "REVERTED" | "REORGED" | "MISMATCH";
  confirmations: bigint; evidenceKey?: string; reason?: string;
}>;

const same = (a: string | undefined | null, b: string) => a?.toLowerCase() === b.toLowerCase();
export function assessPaidReceipt(expected: PaidExpectation, observed: PaidObservation | null, minimumConfirmations = 1n): PaidAssessment {
  if (minimumConfirmations < 1n) throw Error("At least one canonical confirmation is required");
  if (!observed) return { status: "PENDING", confirmations: 0n };
  if (observed.chainId !== expected.chainId || !same(observed.transactionHash, expected.transactionHash)
    || !same(observed.to, expected.router)) return { status: "MISMATCH", confirmations: 0n, reason: "Wrong chain, transaction or destination" };
  if (!same(observed.canonicalBlockHash, observed.blockHash))
    return { status: "REORGED", confirmations: 0n, reason: "Receipt block is not canonical" };
  if (observed.latestBlockNumber < observed.blockNumber)
    return { status: "PENDING", confirmations: 0n, reason: "Head is behind receipt" };
  const confirmations = observed.latestBlockNumber - observed.blockNumber + 1n;
  if (observed.status === "reverted") return { status: "REVERTED", confirmations, reason: "Service-fee state reverted; network gas is not refunded" };
  if (confirmations < minimumConfirmations) return { status: "PENDING", confirmations, reason: "Awaiting canonical confirmations" };
  const fee = observed.feeLogs.filter((log) => same(log.address, expected.router)
    && same(log.payer, expected.payer) && same(log.recipient, expected.feeRecipient)
    && same(log.intentId, expected.intentId) && same(log.operationCode, expected.operationCode)
    && log.amount === expected.expectedFee);
  const operation = observed.operationLogs.filter((log) => same(log.address, expected.router)
    && same(log.payer, expected.payer) && same(log.intentId, expected.intentId)
    && same(log.operationCode, expected.operationCode) && same(log.requestHash, expected.requestHash));
  const transfer = observed.transferLogs.filter((log) => same(log.address, expected.paymentToken)
    && same(log.payer, expected.payer) && same(log.recipient, expected.feeRecipient)
    && log.amount === expected.expectedFee);
  if (fee.length !== 1 || operation.length !== 1 || transfer.length !== 1
    || new Set([fee[0]?.logIndex, operation[0]?.logIndex, transfer[0]?.logIndex]).size !== 3)
    return { status: "MISMATCH", confirmations, reason: "Fee, execution or token transfer evidence is absent or duplicated" };
  return { status: "CONFIRMED", confirmations,
    evidenceKey: `${expected.chainId}:${expected.transactionHash.toLowerCase()}:${fee[0].logIndex}` };
}

export type PaidRecord = Readonly<{ chainId: number; evidenceKey: string; blockHash: Hex; transactionHash: Hex; intentId: Hex; status: "CONFIRMED" }>;
export function mergePaidRecord(records: readonly PaidRecord[], next: PaidRecord): readonly PaidRecord[] {
  const prior = records.find((record) => record.evidenceKey === next.evidenceKey);
  if (prior) {
    if (prior.chainId !== next.chainId || !same(prior.blockHash, next.blockHash) || !same(prior.intentId, next.intentId))
      throw Error("Conflicting evidence for the same fee event");
    return records;
  }
  if (records.some((record) => record.chainId === next.chainId &&
    (same(record.transactionHash, next.transactionHash) || same(record.intentId, next.intentId))))
    throw Error("Transaction or paid intent already reconciled");
  return [...records, next];
}
