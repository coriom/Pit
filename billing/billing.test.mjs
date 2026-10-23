import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { BillingStore } from './store.mjs';
import { CATALOG, PREMIUM_OPERATIONS } from './catalog.mjs';
import { LocalBillingApi } from './local-api.mjs';
import { packEconomics, screenFutureOperation } from './economics.mjs';
import { processStripeWebhook, mockCoinGateSettlement, mockCoinGateReversal, x402Challenge, mockX402Resource } from './payments.mjs';

const t0 = '2026-10-23T00:00:00.000Z', t1 = '2026-11-23T00:00:00.000Z', t2 = '2026-12-23T00:00:00.000Z';
const secret = 'whsec_local_fixture_only';
function fixture(sku = 'pack10', id = 'order1') {
  const store = new BillingStore(); store.user('alice', t0); store.user('bob', t0);
  store.order({ id, userId: 'alice', sku, expiresAt: t1 });
  return store;
}
function stripe(store, { id = 'evt1', type = 'checkout.session.completed', orderId = 'order1', cents = 1000, status = 'paid', periodEnd } = {}, now = t0) {
  assert.ok(store.row('SELECT 1 FROM orders WHERE id=?', orderId));
  const event = { id, type, data: { object: { id: `pi_${orderId}`, payment_intent: `pi_${orderId}`, payment_status: status, amount_total: cents, currency: 'eur', metadata: { pit_order_id: orderId, pit_user_id: 'alice', pit_period_end: periodEnd } } } };
  const raw = JSON.stringify(event), timestamp = Math.floor(Date.parse(now) / 1000);
  const signature = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  return { raw, signature: `t=${timestamp},v1=${signature}`, event };
}

test('provisional catalogue and disabled premium operations', () => {
  assert.deepEqual([CATALOG.pro.cents, CATALOG.pro.monthlyCredits], [990, 100]);
  assert.deepEqual([CATALOG.pack5.credits, CATALOG.pack10.credits, CATALOG.pack25.credits], [50, 110, 300]);
  assert.ok(Object.values(PREMIUM_OPERATIONS).every(x => !x.enabled));
});
test('exact processor screen stays incomplete without measured marginal cost', () => {
  const terms = { feeBps: 150, fixedCents: 25 };
  assert.equal(packEconomics('pack5', terms).netPerCreditMicroEur, '93500');
  assert.equal(packEconomics('pack10', terms).netPerCreditMicroEur, '87272');
  assert.equal(packEconomics('pack25', terms).netPerCreditMicroEur, '81250');
  assert.equal(packEconomics('pro', terms).netPerCreditMicroEur, '95015');
  assert.equal(screenFutureOperation('future-ai-analysis', null, '0', '81250').status, 'INCOMPLETE');
  assert.equal(screenFutureOperation('future-ai-analysis', '1500000', '100000', '81250').status, 'MODEL_POSITIVE');
  assert.equal(screenFutureOperation('future-ai-analysis', '2500000', '0', '81250').status, 'MODEL_NEGATIVE');
});
test('authenticated local facade isolates users and rejects nonexistent products', () => {
  const s = fixture(); const api = new LocalBillingApi(s, [['alice-test-token', 'alice'], ['bob-test-token', 'bob']]);
  assert.throws(() => api.me('invalid', t0), /authentication/);
  assert.equal(api.me('bob-test-token', t0).credits, 0);
  assert.deepEqual(api.history('bob-test-token'), []);
  assert.throws(() => api.order('alice-test-token', 'bad', 'premium-real', t1), /unknown/);
  assert.throws(() => s.spend('alice', 'future-ai-analysis', 'x', t0), /unavailable/);
  s.close();
});
test('signed Stripe purchase credits exactly once, and replay/collision fail closed', () => {
  const s = fixture(), e = stripe(s);
  assert.equal(processStripeWebhook(s, e.raw, e.signature, secret, t0).balance.credits, 110);
  assert.deepEqual(processStripeWebhook(s, e.raw, e.signature, secret, t0), { duplicate: true });
  assert.equal(s.ledger('alice').length, 1);
  const changed = stripe(s, { id: 'evt1', cents: 999 });
  assert.throws(() => processStripeWebhook(s, changed.raw, changed.signature, secret, t0), /collision/);
  s.close();
});
test('Stripe raw-body tampering, bad secret, stale and unpaid events grant nothing', () => {
  const s = fixture(), e = stripe(s);
  assert.throws(() => processStripeWebhook(s, e.raw + ' ', e.signature, secret, t0), /signature/);
  assert.throws(() => processStripeWebhook(s, e.raw, e.signature, 'whsec_wrong', t0), /signature/);
  assert.throws(() => processStripeWebhook(s, e.raw, e.signature, secret, t1), /signature/);
  const unpaid = stripe(s, { status: 'unpaid' });
  assert.throws(() => processStripeWebhook(s, unpaid.raw, unpaid.signature, secret, t0), /not paid/);
  assert.equal(s.snapshot('alice', t0).credits, 0); s.close();
});
test('amount, currency and account association are verified against server order', () => {
  const s = fixture(), e = stripe(s, { cents: 900 });
  assert.throws(() => processStripeWebhook(s, e.raw, e.signature, secret, t0), /mismatch/);
  const bad = stripe(s); bad.event.data.object.metadata.pit_user_id = 'bob';
  const raw = JSON.stringify(bad.event), ts = Math.floor(Date.parse(t0)/1000), sig = `t=${ts},v1=${createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex')}`;
  assert.throws(() => processStripeWebhook(s, raw, sig, secret, t0), /account mismatch/);
  assert.equal(s.snapshot('alice', t0).credits, 0); s.close();
});
test('failed subscription validation rolls back the entire payment and credit grant', () => {
  const s = fixture('pro');
  const e = stripe(s, { cents: 990 });
  assert.throws(() => processStripeWebhook(s, e.raw, e.signature, secret, t0), /subscription period/);
  assert.equal(s.snapshot('alice', t0).credits, 0);
  assert.equal(s.row('SELECT status FROM orders WHERE id=?', 'order1').status, 'pending');
  assert.equal(s.row('SELECT count(*) AS n FROM payment_events').n, 0);
  s.close();
});
test('refund before purchase prevents later entitlement; spent refund freezes with deficit', () => {
  const s = fixture();
  const refund = stripe(s, { id: 'refund1', type: 'charge.refunded' });
  processStripeWebhook(s, refund.raw, refund.signature, secret, t0);
  const purchase = stripe(s);
  assert.deepEqual(processStripeWebhook(s, purchase.raw, purchase.signature, secret, t0), { ignored: 'refunded' });
  assert.equal(s.snapshot('alice', t0).credits, 0); s.close();
  const s2 = fixture(); processStripeWebhook(s2, purchase.raw, purchase.signature, secret, t0);
  s2.debit('alice', 80, 'test:operation1', t0, { testOnly: true });
  processStripeWebhook(s2, refund.raw, refund.signature, secret, t0);
  assert.deepEqual([s2.snapshot('alice', t0).credits, s2.snapshot('alice', t0).unrecovered, s2.snapshot('alice', t0).frozen], [0, 80, true]);
  assert.throws(() => s2.debit('alice', 1, 'test:operation2', t0, { testOnly: true }), /frozen/);
  assert.equal(s2.row('SELECT deficit FROM reversals WHERE source=?', 'refund:order1').deficit, 80); s2.close();
});
test('later verified credits first reconcile a prior reversal deficit', () => {
  const s = fixture(); const e = stripe(s); processStripeWebhook(s, e.raw, e.signature, secret, t0);
  s.debit('alice', 110, 'test:used', t0, { testOnly: true });
  const refund = stripe(s, { id: 'refund1', type: 'charge.refunded' });
  processStripeWebhook(s, refund.raw, refund.signature, secret, t0);
  assert.deepEqual([s.snapshot('alice', t0).credits, s.snapshot('alice', t0).unrecovered], [0, 110]);
  s.order({ id: 'order2', userId: 'alice', sku: 'pack25', expiresAt: t1 });
  const newPayment = stripe(s, { id: 'evt2', orderId: 'order2', cents: 2500 });
  processStripeWebhook(s, newPayment.raw, newPayment.signature, secret, t0);
  assert.deepEqual([s.snapshot('alice', t0).credits, s.snapshot('alice', t0).unrecovered], [190, 0]);
  assert.equal(s.ledger('alice').reduce((sum, row) => sum + row.delta, 0), 190);
  assert.equal(s.snapshot('alice', t0).frozen, true); // manual review is still required
  s.close();
});
test('signed dispute reverses only the payment associated with that order', () => {
  const s = fixture(); const e = stripe(s); processStripeWebhook(s, e.raw, e.signature, secret, t0);
  const wrong = stripe(s, { id: 'dispute-wrong', type: 'charge.dispute.created' });
  wrong.event.data.object.payment_intent = 'pi_other';
  const raw = JSON.stringify(wrong.event), ts = Math.floor(Date.parse(t0)/1000), sig = `t=${ts},v1=${createHmac('sha256',secret).update(`${ts}.${raw}`).digest('hex')}`;
  assert.throws(() => processStripeWebhook(s, raw, sig, secret, t0), /payment mismatch/);
  assert.equal(s.snapshot('alice', t0).credits, 110);
  const valid = stripe(s, { id: 'dispute-valid', type: 'charge.dispute.created' });
  processStripeWebhook(s, valid.raw, valid.signature, secret, t0);
  assert.equal(s.snapshot('alice', t0).credits, 0); s.close();
});
test('debits conserve balance and unique source prevents replay or overspend', async () => {
  const s = fixture(); const e = stripe(s); processStripeWebhook(s, e.raw, e.signature, secret, t0);
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => Promise.resolve().then(() => s.debit('alice', 10, `test:spend${i}`, t0, { testOnly: true }))));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 11);
  assert.equal(s.snapshot('alice', t0).credits, 0);
  assert.throws(() => s.debit('alice', 1, 'test:spend0', t0, { testOnly: true }));
  assert.equal(s.ledger('alice').reduce((sum, x) => sum + x.delta, 0), 0); s.close();
});
test('two independent SQLite connections cannot both spend the same credits', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pit-billing-'));
  const path = join(dir, 'billing.sqlite');
  try {
    const s = new BillingStore(path); s.user('alice', t0);
    s.order({ id: 'order1', userId: 'alice', sku: 'pack10', expiresAt: t1 });
    const e = stripe(s); processStripeWebhook(s, e.raw, e.signature, secret, t0); s.close();
    const run = source => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./concurrency-worker.mjs', import.meta.url), { workerData: { path, source, now: t0 } });
      worker.once('message', resolve); worker.once('error', reject);
    });
    const result = await Promise.all([run('test:a'), run('test:b')]);
    assert.equal(result.filter(x => x.ok).length, 1);
    const check = new BillingStore(path); assert.equal(check.snapshot('alice', t0).credits, 30); check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('subscription renewal, cancellation, failure, expiry and refund', () => {
  const s = fixture('pro'); const e = stripe(s, { cents: 990, periodEnd: t1 });
  processStripeWebhook(s, e.raw, e.signature, secret, t0);
  assert.deepEqual([s.snapshot('alice', t0).plan, s.snapshot('alice', t0).credits], ['pro', 100]);
  const cancel = stripe(s, { id: 'cancel1', type: 'customer.subscription.deleted', cents: 990 });
  processStripeWebhook(s, cancel.raw, cancel.signature, secret, t0);
  assert.equal(s.snapshot('alice', t0).subscription.status, 'canceling');
  assert.equal(s.expire('alice', t1).plan, 'free');
  s.order({ id: 'renewal1', userId: 'alice', sku: 'pro', expiresAt: t2 });
  const renew = stripe(s, { id: 'renew1', orderId: 'renewal1', cents: 990, type: 'invoice.paid', periodEnd: t2 }, t1);
  processStripeWebhook(s, renew.raw, renew.signature, secret, t1);
  assert.equal(s.snapshot('alice', t1).credits, 200);
  const fail = stripe(s, { id: 'fail1', orderId: 'renewal1', cents: 990, type: 'invoice.payment_failed' }, t1);
  processStripeWebhook(s, fail.raw, fail.signature, secret, t1);
  assert.equal(s.snapshot('alice', t1).plan, 'pro'); // late failure of the paid invoice cannot revoke it
  const refund = stripe(s, { id: 'refund2', orderId: 'renewal1', cents: 990, type: 'charge.refunded' }, t1);
  processStripeWebhook(s, refund.raw, refund.signature, secret, t1);
  assert.equal(s.snapshot('alice', t1).credits, 100);
  assert.equal(s.snapshot('alice', t1).plan, 'free'); s.close();
});
test('CoinGate mock rejects wrong chain, token, recipient, amount, expired and unconfirmed settlement', () => {
  const s = fixture();
  const invoice = { orderId: 'order1', callbackToken: 'fixture-secret', chain: 'eip155:8453', token: 'USDC', recipient: 'mock-recipient', atomicAmount: '1000000', expiresAt: t1 };
  const readback = { ...invoice, eventId: 'cg1', transactionId: 'tx1', status: 'paid', priceCents: 1000, currency: 'EUR', confirmed: true };
  for (const change of [{ chain: 'eip155:1' }, { token: 'USDT' }, { recipient: 'other' }, { atomicAmount: '1' }, { confirmed: false }, { callbackToken: 'wrong' }]) {
    assert.throws(() => mockCoinGateSettlement(s, invoice, { ...readback, ...change }, t0), /unverified/);
  }
  assert.throws(() => mockCoinGateSettlement(s, invoice, readback, t2), /unverified/);
  assert.equal(mockCoinGateSettlement(s, invoice, readback, t0).balance.credits, 110);
  assert.deepEqual(mockCoinGateSettlement(s, invoice, readback, t0), { duplicate: true }); s.close();
});
test('CoinGate mock refund needs reconciled provider readback and reverses once', () => {
  const s = fixture();
  const invoice = { orderId: 'order1', callbackToken: 'fixture-secret', chain: 'eip155:8453', token: 'USDC', recipient: 'mock-recipient', atomicAmount: '1000000', expiresAt: t1 };
  const paid = { ...invoice, eventId: 'cg1', transactionId: 'tx1', status: 'paid', priceCents: 1000, currency: 'EUR', confirmed: true };
  mockCoinGateSettlement(s, invoice, paid, t0);
  const reversed = { ...paid, eventId: 'cg-refund1', status: 'refunded', reconciled: true };
  assert.throws(() => mockCoinGateReversal(s, invoice, { ...reversed, reconciled: false }, t0), /unverified/);
  assert.equal(mockCoinGateReversal(s, invoice, reversed, t0).balance.credits, 0);
  assert.deepEqual(mockCoinGateReversal(s, invoice, reversed, t0), { duplicate: true });
  s.close();
});
test('x402 mock challenges then verifies and settles one operation only', async () => {
  const s = fixture(); const challenge = x402Challenge({ resourceUrl: 'https://example.invalid/premium', operationId: 'batch', network: 'eip155:8453', asset: `0x${'1'.repeat(40)}`, amount: '10000', payTo: `0x${'2'.repeat(40)}` });
  const facilitator = { verify: async () => ({ valid: true, operationId: 'batch' }), settle: async () => ({ success: true, operationId: 'batch', paymentId: 'mocktx1' }) };
  assert.equal((await mockX402Resource(s, challenge, null, facilitator, 'batch', t0, () => 'secret')).status, 402);
  await assert.rejects(() => mockX402Resource(s, challenge, 'payload', { ...facilitator, verify: async () => ({ valid: false }) }, 'batch', t0, () => 'secret'), /verification/);
  await assert.rejects(() => mockX402Resource(s, challenge, 'payload', { ...facilitator, settle: async () => ({ success: false }) }, 'batch', t0, () => 'secret'), /settlement/);
  const response = await mockX402Resource(s, challenge, 'payload', facilitator, 'batch', t0, () => 'secret');
  assert.equal(response.body, 'secret');
  await assert.rejects(() => mockX402Resource(s, challenge, 'payload', facilitator, 'batch', t0, () => 'secret'), /UNIQUE/);
  assert.equal(s.snapshot('alice', t0).credits, 0); s.close();
});
