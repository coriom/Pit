// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — public CoW API readback, no signature output.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { keccak256, toBytes } from "viem";
import { TEST_OPERATOR as p } from "./autonomous-signer.mjs";

const submitted = JSON.parse(await readFile("docs/audit/phase-w/order-submission.json", "utf8"));
const fill = JSON.parse(await readFile("docs/audit/phase-w/live-fill.json", "utf8"));
assert.match(submitted.orderUid, /^0x[0-9a-fA-F]{112}$/);
const response = await fetch(`${p.cowApi}/api/v1/orders/${submitted.orderUid}`);
assert.equal(response.status, 200);
const order = await response.json();
assert.equal(order.uid, submitted.orderUid);
assert.equal(order.status, "fulfilled");
assert.equal(order.owner.toLowerCase(), p.address.toLowerCase());
assert.equal(order.sellToken.toLowerCase(), p.weth.toLowerCase());
assert.equal(order.buyToken.toLowerCase(), p.usdc.toLowerCase());
assert.equal(BigInt(order.sellAmount), p.sellBudget);
assert.equal(BigInt(order.feeAmount), 0n);
assert.equal(BigInt(order.executedFeeAmount), 0n);
assert.equal(BigInt(order.executedSellAmountBeforeFees), p.sellBudget);
assert.equal(order.executedBuyAmount, fill.trade.buyAmount);
assert.equal(order.signingScheme, "eip712");
const appData = JSON.parse(order.fullAppData);
assert.equal(keccak256(toBytes(order.fullAppData)).toLowerCase(), order.appData.toLowerCase());
assert.equal(appData.appCode, "PIT");
assert.equal(appData.metadata?.partnerFee, undefined);
const result = { checkedAt: new Date().toISOString(), httpStatus: response.status,
  orderUid: submitted.orderUid, account: order.owner, status: order.status,
  sellAmount: order.sellAmount, buyAmountMinimum: order.buyAmount,
  executedSellAmountBeforeFees: order.executedSellAmountBeforeFees,
  executedBuyAmount: order.executedBuyAmount, orderFeeAmount: order.feeAmount,
  executedFeeAmount: order.executedFeeAmount,
  pitPartnerFeeMetadataPresent: false, appCode: appData.appCode,
  appDataHash: `public-hash:${order.appData.slice(2,34)}:${order.appData.slice(34)}`,
  appDataHashVerified: true, signingScheme: order.signingScheme };
await writeFile("docs/audit/phase-w/order-verification.json", JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(result));
