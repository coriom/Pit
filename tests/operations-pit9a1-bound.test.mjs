import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { canonical, digest, manifest, manifestSha256, transactionPayload, validateManifest } from "../scripts/operations/pit9a1-bound-plan.mjs";
import { assertPrepared, assertSigned, recoveryDecision, status } from "../scripts/operations/pit9a1-bound-guard.mjs";

const clone = (x) => structuredClone(x);
const receipts = Array.from({ length: 15 }, (_, i) => ({ canonical: true, blockTimestamp: 1_793_222_400 + 12 * i }));
const context = (index) => ({ completedCount: index, chainId: 84532, signer: manifest.signer,
  nonce: BigInt(19 + index), pendingNonce: BigInt(19 + index), gasEstimate: 50_000n,
  currentGasPrice: 6_000_000n, maxFeePerGas: 50_000_000n, spentWei: 0n,
  signerEthWei: 2_000_000_000_000_000n, pending: false });

test("canonical manifest binds all 15 actions and deterministic dependent payloads", () => {
  assert.equal(validateManifest(manifest), true);
  assert.equal(digest(manifest), manifestSha256);
  assert.equal(canonical({ b: 2, a: 1 }), canonical({ a: 1, b: 2 }));
  for (let i = 0; i < 15; i++) {
    const first = transactionPayload(manifest, i, receipts);
    const second = transactionPayload(manifest, i, receipts);
    assert.equal(first.dataKeccak, second.dataKeccak);
    assert.equal(first.payloadSha256, second.payloadSha256);
    assert.equal(first.nonce, BigInt(19 + i));
    assert.equal(assertPrepared(manifest, manifestSha256, i, receipts, context(i), first).data, first.data);
  }
  const fee = manifest.actions.filter((x) => x.feeMicro).reduce((sum, x) => sum + BigInt(x.feeMicro), 0n);
  assert.equal(fee, BigInt(manifest.limits.maximumServiceFeeMicro));
  assert.equal(manifest.actions.filter((x) => x.kind === "approve").length, 8);
  assert.equal(manifest.actions.filter((x) => x.kind.startsWith("paid-")).length, 5);
});

test("every material manifest mutation invalidates the approved campaign digest", () => {
  const edits = [
    [3, "recipient", "0x0000000000000000000000000000000000000001"],
    [5, "capRaw", "21000000000000000000"], [5, "administrator", manifest.feeRecipient],
    [5, "minting", false], [5, "burning", false], [5, "pausing", false],
    [8, "token", manifest.paymentToken], [8, "recipients", [{ address: manifest.feeRecipient, amountRaw: "2" }]],
    [11, "beneficiary", manifest.feeRecipient], [11, "unlockTime", { fromReceiptIndex: 10, addSeconds: 7200 }],
    [14, "beneficiary", manifest.feeRecipient], [14, "cliff", { fromReceiptIndex: 13, addSeconds: 3600 }],
    [14, "durationSeconds", 100], [7, "spender", manifest.feeRecipient],
    [7, "amountRaw", "2000000000000000001"], [3, "feeMicro", "100001"],
    [3, "quote", { ...manifest.actions[3].quote, intentId: manifest.actions[5].quote.intentId }],
    [0, "expectedCreationBytecodeKeccak", `0x${"00".repeat(32)}`],
    [2, "to", manifest.feeRecipient],
  ];
  for (const [i, field, value] of edits) {
    const changed = clone(manifest); changed.actions[i][field] = value;
    assert.throws(() => validateManifest(changed), /Manifest hash/);
  }
  for (const [field, value] of [["chainId", 1], ["signer", manifest.feeRecipient], ["paymentToken", manifest.feeRecipient],
    ["feeRecipient", manifest.signer], ["priceAdministrator", manifest.feeRecipient]]) {
    const changed = clone(manifest); changed[field] = value;
    assert.throws(() => validateManifest(changed), /Manifest hash/);
  }
  const fewer = clone(manifest); fewer.actions.pop(); assert.throws(() => validateManifest(fewer));
  assert.throws(() => validateManifest({ ...manifest, arbitrary: true }));
});

test("no required campaign or transaction field may disappear", () => {
  for (const field of Object.keys(manifest)) {
    const changed = clone(manifest); delete changed[field];
    assert.throws(() => validateManifest(changed), undefined, `campaign.${field}`);
  }
  for (let index = 0; index < manifest.actions.length; index++) {
    for (const field of Object.keys(manifest.actions[index])) {
      const changed = clone(manifest); delete changed.actions[index][field];
      assert.throws(() => validateManifest(changed), undefined, `actions[${index}].${field}`);
    }
  }
  for (const path of [["paymentCode", "implementation"], ["limits", "maximumTotalSpendWei"],
    ["addresses", "paidCreator"], ["existingInfrastructure", "factory"]]) {
    const changed = clone(manifest); delete changed[path[0]][path[1]];
    assert.throws(() => validateManifest(changed), undefined, path.join("."));
  }
});

test("prepared transaction and budget checks reject drift before signing", () => {
  const i = 8, exact = transactionPayload(manifest, i, receipts), base = context(i);
  for (const alteration of [
    { data: `${exact.data.slice(0, -2)}ff` }, { to: manifest.feeRecipient }, { nonce: 1n },
    { value: 1n }, { gasLimit: exact.gasLimit + 1n }, { payloadSha256: "bad" },
    { actionSpecSha256: "bad" },
  ]) assert.throws(() => assertPrepared(manifest, manifestSha256, i, receipts, base, { ...exact, ...alteration }));
  for (const alteration of [
    { chainId: 8453 }, { signer: manifest.feeRecipient }, { nonce: 20n }, { pendingNonce: 20n },
    { completedCount: 7 }, { gasEstimate: exact.gasLimit + 1n }, { currentGasPrice: 51_000_000n },
    { maxFeePerGas: 51_000_000n }, { spentWei: 1_099_000_000_000_000n }, { signerEthWei: 1n },
    { pending: true }, { uncertain: true }, { reorged: true },
  ]) assert.throws(() => assertPrepared(manifest, manifestSha256, i, receipts, { ...base, ...alteration }, exact));
  assert.throws(() => assertPrepared(manifest, "bad", i, receipts, base, exact));
  assert.throws(() => transactionPayload(manifest, 3, []), /Canonical dependency/);
  const noncanonical = clone(receipts); noncanonical[7].canonical = false;
  assert.throws(() => transactionPayload(manifest, 8, noncanonical), /Canonical dependency/);
});

test("signed bytes are checked against exact sender, chain, nonce, calldata and fee cap", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const exact = { from: account.address, to: manifest.paymentToken, chainId: 84532, nonce: 19n,
    gasLimit: 80_000n, maxFeePerGas: 50_000_000n, value: 0n,
    data: transactionPayload(manifest, 2, receipts).data };
  const sign = (overrides = {}) => account.signTransaction({ type: "eip1559", chainId: 84532,
    to: exact.to, nonce: 19, gas: exact.gasLimit, maxFeePerGas: exact.maxFeePerGas,
    maxPriorityFeePerGas: 1_000_000n, value: 0n, data: exact.data, ...overrides });
  assert.match(await assertSigned(await sign(), exact), /^0x[0-9a-f]{64}$/);
  for (const override of [{ to: manifest.feeRecipient }, { chainId: 1 }, { nonce: 20 },
    { maxFeePerGas: 51_000_000n }, { value: 1n }, { data: "0x1234" }])
    await assert.rejects(assertSigned(await sign(override), exact));
  await assert.rejects(assertSigned(await sign(), { ...exact, from: manifest.signer }));
});

test("uncertain submissions and replaced or noncanonical receipts never trigger an automatic retry", () => {
  const pending = { nonce: "19", txHash: `0x${"12".repeat(32)}` };
  assert.equal(recoveryDecision(null, { nonce: 19n }), status.NOT_SUBMITTED);
  assert.equal(recoveryDecision(null, { nonce: 20n, completed: true }), status.COMPLETED);
  assert.equal(recoveryDecision(pending, { nonce: 19n }), status.SUBMISSION_UNCERTAIN);
  assert.equal(recoveryDecision(pending, { nonce: 19n, transactionPresent: true }), status.RECEIPT_UNAVAILABLE);
  assert.equal(recoveryDecision(pending, { nonce: 20n }), status.REPLACED);
  assert.equal(recoveryDecision(pending, { nonce: 20n, receipt: { transactionHash: pending.txHash, canonical: false } }), status.REORGED);
  assert.equal(recoveryDecision(pending, { nonce: 20n, receipt: { transactionHash: pending.txHash, canonical: true, status: "success" } }), status.MINED_SUCCESS);
  assert.equal(recoveryDecision(pending, { nonce: 20n, receipt: { transactionHash: pending.txHash, canonical: true, status: "reverted" } }), status.MINED_REVERTED);
  assert.equal(recoveryDecision(pending, { nonce: 20n, receipt: { transactionHash: `0x${"34".repeat(32)}` } }), status.INCONSISTENT);
});
