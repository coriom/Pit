// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — public chain readback, never loads a signer.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, decodeEventLog, erc20Abi } from "viem";
import { sepolia } from "viem/chains";
import { castTransport, TEST_OPERATOR as p } from "./autonomous-signer.mjs";

const source = JSON.parse(await readFile("docs/audit/phase-w/live-fill.json", "utf8"));
const client = createPublicClient({ chain: sepolia, transport: castTransport() });
assert.equal(await client.getChainId(), 11155111);
const hash = source.event.txid;
const [tx, receipt] = await Promise.all([
  client.getTransaction({ hash }), client.getTransactionReceipt({ hash }),
]);
const block = await client.getBlock({ blockNumber: receipt.blockNumber });
assert.equal(receipt.status, "success");
assert.equal(receipt.blockNumber, BigInt(source.trade.blockNumber));
assert.equal(receipt.blockHash.toLowerCase(), block.hash.toLowerCase());
assert.equal(tx.to?.toLowerCase(), p.settlement.toLowerCase());
assert.equal(tx.chainId, p.chainId);
const transfers = [];
for (const log of receipt.logs) {
  if (![p.weth.toLowerCase(), p.usdc.toLowerCase()].includes(log.address.toLowerCase())) continue;
  try {
    const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
    if (decoded.eventName !== "Transfer") continue;
    const from = decoded.args.from.toLowerCase(), to = decoded.args.to.toLowerCase();
    if (from !== p.address.toLowerCase() && to !== p.address.toLowerCase()) continue;
    transfers.push({ token: log.address, from: decoded.args.from, to: decoded.args.to,
      amount: decoded.args.value.toString(), logIndex: log.logIndex });
  } catch { /* other token event */ }
}
assert.ok(transfers.some((t) => t.token.toLowerCase() === p.weth.toLowerCase() &&
  t.from.toLowerCase() === p.address.toLowerCase() && BigInt(t.amount) === BigInt(source.trade.sellAmount)));
assert.ok(transfers.some((t) => t.token.toLowerCase() === p.usdc.toLowerCase() &&
  t.to.toLowerCase() === p.address.toLowerCase() && BigInt(t.amount) === BigInt(source.trade.buyAmount)));
const result = { chainId: 11155111, txHash: hash, txTo: tx.to, txFrom: tx.from,
  status: receipt.status, blockNumber: Number(receipt.blockNumber), blockHash: receipt.blockHash,
  blockTimestampUtc: new Date(Number(block.timestamp) * 1000).toISOString(),
  gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
  solverGasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
  walletTransfers: transfers };
await writeFile("docs/audit/phase-w/settlement-verification.json", JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(result));
