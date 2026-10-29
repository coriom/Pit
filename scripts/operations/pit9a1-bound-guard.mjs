import { parseTransaction, recoverTransactionAddress, keccak256 } from "viem";
import { manifestSha256, transactionPayload, validateManifest } from "./pit9a1-bound-plan.mjs";

const same = (a, b) => (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
export const status = Object.freeze({ NOT_SUBMITTED: "NOT_SUBMITTED", SUBMISSION_UNCERTAIN: "SUBMISSION_UNCERTAIN",
  MINED_SUCCESS: "MINED_SUCCESS", MINED_REVERTED: "MINED_REVERTED", REPLACED: "REPLACED",
  RECEIPT_UNAVAILABLE: "RECEIPT_UNAVAILABLE", REORGED: "REORGED", INCONSISTENT: "INCONSISTENT", COMPLETED: "COMPLETED" });

export function assertPrepared(campaign, approvedHash, index, receipts, context, prepared) {
  validateManifest(campaign);
  if (approvedHash !== manifestSha256) throw Error("Missing or stale manifest approval hash");
  const action = campaign.actions[index];
  if (!action || index !== context.completedCount || index >= Number(campaign.limits.maximumTransactions)) throw Error("Unapproved or out-of-order action");
  const exact = transactionPayload(campaign, index, receipts);
  if (context.chainId !== campaign.chainId || !same(context.signer, campaign.signer)
    || context.nonce !== exact.nonce || context.pendingNonce !== exact.nonce) throw Error("Wrong chain, signer or nonce");
  if (context.pending || context.uncertain || context.reorged) throw Error("Unresolved previous transaction");
  if (!same(prepared.from, exact.from) || prepared.chainId !== exact.chainId || prepared.nonce !== exact.nonce
    || !same(prepared.to, exact.to) || prepared.value !== 0n || prepared.data !== exact.data
    || prepared.gasLimit !== exact.gasLimit || prepared.payloadSha256 !== exact.payloadSha256
    || prepared.actionSpecSha256 !== exact.actionSpecSha256)
    throw Error("Prepared transaction differs from approved payload");
  if (context.gasEstimate < 1n || context.gasEstimate > exact.gasLimit) throw Error("Gas estimate exceeds action ceiling");
  const maxGasPrice = BigInt(campaign.limits.maximumFeePerGasWei);
  if (context.currentGasPrice < 1n || context.currentGasPrice > maxGasPrice) throw Error("Gas price exceeds approval");
  if (context.maxFeePerGas < context.currentGasPrice || context.maxFeePerGas > maxGasPrice) throw Error("Signed fee cap exceeds approval");
  const reserve = exact.gasLimit * context.maxFeePerGas + BigInt(campaign.limits.l1ReservePerTransactionWei);
  if (context.spentWei < 0n || context.spentWei + reserve > BigInt(campaign.limits.maximumTotalSpendWei)
    || context.signerEthWei < reserve) throw Error("Insufficient remaining campaign budget or ETH");
  return { ...exact, reserveWei: reserve, maxFeePerGas: context.maxFeePerGas };
}

export async function assertSigned(raw, exact) {
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(raw)) throw Error("Malformed signed transaction");
  const tx = parseTransaction(raw);
  const recovered = await recoverTransactionAddress({ serializedTransaction: raw });
  if (!same(recovered, exact.from) || tx.type !== "eip1559" || tx.chainId !== exact.chainId
    || BigInt(tx.nonce) !== exact.nonce || !same(tx.to, exact.to) || tx.data !== exact.data
    || (tx.value ?? 0n) !== 0n || tx.gas !== exact.gasLimit || tx.maxFeePerGas !== exact.maxFeePerGas
    || (tx.maxPriorityFeePerGas ?? 0n) > exact.maxFeePerGas)
    throw Error("Signed transaction differs from approved payload");
  return keccak256(raw);
}

// An uncertain submission never becomes retryable merely because a receipt query timed out.
export function recoveryDecision(pending, chain) {
  if (!pending) return chain.completed ? status.COMPLETED : status.NOT_SUBMITTED;
  if (chain.nonce < BigInt(pending.nonce)) throw Error("Chain nonce moved backwards");
  if (chain.receipt) {
    if (!same(chain.receipt.transactionHash, pending.txHash)) return status.INCONSISTENT;
    if (chain.receipt.canonical === false) return status.REORGED;
    return chain.receipt.status === "success" ? status.MINED_SUCCESS : status.MINED_REVERTED;
  }
  if (chain.nonce > BigInt(pending.nonce)) return status.REPLACED;
  if (chain.transactionPresent) return status.RECEIPT_UNAVAILABLE;
  return status.SUBMISSION_UNCERTAIN;
}
