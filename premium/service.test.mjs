import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BillingStore } from '../billing/store.mjs';
import { mockCoinGateSettlement } from '../billing/payments.mjs';
import { PremiumLocalService } from './service.mjs';
import { portfolioExample, journalExample } from './examples.mjs';
import * as reports from '../dist-premium-local/reports.mjs';

const now = '2026-10-23T00:00:00.000Z', next = '2026-11-23T00:00:00.000Z';
function fixture() {
  const store = new BillingStore(); store.user('alice', now); store.user('bob', now);
  store.order({ id: 'fixture-pack', userId: 'alice', sku: 'pack10', expiresAt: next });
  const invoice=store.attachMockCryptoInvoice({orderId:'fixture-pack',recipient:`0x${'2'.repeat(40)}`,atomicAmount:'10000000',issuedAt:now});
  mockCoinGateSettlement(store,invoice,{...invoice,eventId:'paid-once',transactionId:'fixture-pay',status:'paid',priceCents:1000,currency:'EUR',confirmed:true},now);
  return { store, service: new PremiumLocalService(store, [['alice-local', 'alice'], ['bob-local', 'bob']], reports) };
}

test('one successful report debits ten; exact retry recomputes but never double-charges', () => {
  const { store, service } = fixture();
  const request = { operationId: 'portfolio-batch-risk', requestId: 'req-1', input: portfolioExample };
  const first = service.run('alice-local', request, now);
  assert.deepEqual(first.receipt, { requestId: 'req-1', credits: 10, charged: true });
  assert.equal(first.entitlement.credits, 100);
  const retry = service.run('alice-local', request, now);
  assert.equal(retry.receipt.charged, false);
  assert.deepEqual(retry.report, first.report);
  assert.equal(store.ledger('alice').filter(x => x.kind === 'premium-report').length, 1);
  assert.throws(() => service.run('alice-local', { ...request, input: { ...portfolioExample, currency: 'EUR' } }, now), /idempotency collision/);
  store.close();
});
test('invalid report, runner failure and database failure do not consume credits', () => {
  const { store, service } = fixture();
  assert.throws(() => service.run('alice-local', { operationId: 'portfolio-batch-risk', requestId: 'bad', input: { nope: true } }, now));
  assert.throws(() => service.run('alice-local', { operationId: 'trading-journal-advanced', requestId: 'bad2', input: { ...journalExample, startingCapital: '0' } }, now));
  assert.equal(store.snapshot('alice', now).credits, 110);
  store.db.exec('DROP TABLE report_receipts');
  assert.throws(() => service.run('alice-local', { operationId: 'portfolio-batch-risk', requestId: 'db-error', input: portfolioExample }, now), /report_receipts/);
  assert.equal(store.snapshot('alice', now).credits, 110);
  store.close();
});
test('cross-user access and unsupported operations fail closed', () => {
  const { store, service } = fixture();
  assert.throws(() => service.me('wrong-token', now), /authentication/);
  assert.deepEqual(service.history('bob-local'), []);
  assert.equal(service.me('bob-local', now).credits, 0);
  assert.throws(() => service.run('bob-local', { operationId: 'portfolio-batch-risk', requestId: 'bob-request', input: portfolioExample }, now), /insufficient/);
  assert.throws(() => service.run('alice-local', { operationId: 'future-ai-analysis', requestId: 'ai', input: portfolioExample }, now), /invalid local premium/);
  assert.equal(store.snapshot('alice', now).credits, 110); store.close();
});
test('distinct requests contend for limited credits, while same-id concurrent retries charge once', async () => {
  const { store, service } = fixture();
  const tasks = Array.from({ length: 12 }, (_, i) => Promise.resolve().then(() => service.run('alice-local', { operationId: 'trading-journal-advanced', requestId: `j-${i}`, input: journalExample }, now)));
  const result = await Promise.allSettled(tasks);
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 11);
  assert.equal(store.snapshot('alice', now).credits, 0);
  const same = await Promise.allSettled([0, 1].map(() => Promise.resolve().then(() => service.run('alice-local', { operationId: 'trading-journal-advanced', requestId: 'j-1', input: journalExample }, now))));
  assert.equal(same.filter(x => x.status === 'fulfilled').length, 2);
  assert.equal(store.snapshot('alice', now).credits, 0); store.close();
});
test('refund freezes report access and preserves original purchase history', () => {
  const { store, service } = fixture();
  const request = { operationId: 'portfolio-batch-risk', requestId: 'once', input: portfolioExample };
  service.run('alice-local', request, now);
  store.payment({ provider: 'coingate-mock', eventId: 'refund-local', paymentId: 'fixture-pay', orderId: 'fixture-pack', userId: 'alice', cents: 1000, currency: 'EUR', kind: 'refunded', digest: 'a'.repeat(64) }, now);
  assert.equal(store.snapshot('alice', now).frozen, true);
  assert.throws(() => service.run('alice-local', request, now), /frozen/);
  assert.ok(service.history('alice-local').some(x => x.kind === 'premium-report'));
  store.close();
});
