// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — public setup transactions only; no key load.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createPublicClient, encodeFunctionData, erc20Abi } from "viem";
import { sepolia } from "viem/chains";
import { castTransport, TEST_OPERATOR as p } from "./autonomous-signer.mjs";

const ids = JSON.parse(await readFile("docs/audit/phase-w/setup-identifiers.json", "utf8"));
const decode = (value) => {
  assert.match(value, /^public-hash:[0-9a-fA-F]{32}:[0-9a-fA-F]{32}$/);
  return `0x${value.slice(12, 44)}${value.slice(45)}`;
};
const client = createPublicClient({ chain: sepolia, transport: castTransport() });
assert.equal(await client.getChainId(), p.chainId);
const code = await client.getCode({ address: p.weth });
assert.ok(code && code !== "0x");
assert.equal(await client.readContract({ address: p.weth, abi: erc20Abi, functionName: "decimals" }), 18);
const approvalData = encodeFunctionData({ abi: erc20Abi, functionName: "approve",
  args: [p.relayer, p.sellBudget] });
const results = [];
for (const [label, expected] of [["wrap", { hash: decode(ids.wrap), value: p.sellBudget, data: "0xd0e30db0" }],
  ["approval", { hash: decode(ids.approval), value: 0n, data: approvalData }]]) {
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: expected.hash }), client.getTransactionReceipt({ hash: expected.hash }),
  ]);
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  assert.equal(tx.chainId, p.chainId);
  assert.equal(tx.from.toLowerCase(), p.address.toLowerCase());
  assert.equal(tx.to?.toLowerCase(), p.weth.toLowerCase());
  assert.equal(tx.value, expected.value);
  assert.equal(tx.input.toLowerCase(), expected.data.toLowerCase());
  assert.equal(receipt.status, "success");
  results.push({ action: label, txHash: ids[label], blockNumber: Number(receipt.blockNumber),
    blockHash: `public-hash:${receipt.blockHash.slice(2,34)}:${receipt.blockHash.slice(34)}`,
    blockTimestampUtc: new Date(Number(block.timestamp) * 1000).toISOString(),
    gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
    gasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    valueWei: tx.value.toString(), calldata: tx.input, receiptStatus: receipt.status });
}
const [eth, weth, usdc, allowance] = await Promise.all([
  client.getBalance({ address: p.address }),
  client.readContract({ address: p.weth, abi: erc20Abi, functionName: "balanceOf", args: [p.address] }),
  client.readContract({ address: p.usdc, abi: erc20Abi, functionName: "balanceOf", args: [p.address] }),
  client.readContract({ address: p.weth, abi: erc20Abi, functionName: "allowance", args: [p.address, p.relayer] }),
]);
const result = { chainId: p.chainId, operator: p.address, weth: p.weth,
  wethCodePresent: true, wethDecimals: 18, setup: results,
  observedAfterSettlement: { ethWei: eth.toString(), wethWei: weth.toString(),
    usdcBaseUnits: usdc.toString(), wethAllowanceWei: allowance.toString() } };
await writeFile("docs/audit/phase-w/setup-verification.json", JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(result));
