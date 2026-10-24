import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { BASE_NETWORK, BASE_USDC, validMockInvoice, sameSettlement, sameStoredInvoice } from './crypto-contract.mjs';

const fail = message => { throw new Error(message); };
const digest = value => createHash('sha256').update(value).digest('hex');
const same = (a, b) => {
  const left = Buffer.from(String(a)), right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
};

// Retired local Stripe regression fixture from the earlier billing prototype.
// It is not imported by the Worker, current demo, or wallet UI. No card
// checkout is part of the wallet-only product.
export function verifyStripeWebhook(raw, header, secret, nowSeconds) {
  if (typeof raw !== 'string' || raw.length > 65536 || !secret?.startsWith('whsec_')) fail('invalid Stripe webhook');
  const segments = Object.fromEntries(String(header).split(',').map(part => part.trim().split('=')));
  const timestamp = Number(segments.t);
  if (!Number.isSafeInteger(timestamp) || Math.abs(nowSeconds - timestamp) > 300 || !/^[a-f0-9]{64}$/.test(segments.v1 ?? '')) fail('invalid Stripe signature');
  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  if (!same(expected, segments.v1)) fail('invalid Stripe signature');
  const event = JSON.parse(raw);
  if (typeof event.id !== 'string' || typeof event.type !== 'string' || !event.data?.object) fail('invalid Stripe event');
  return event;
}

export function stripePaymentEvent(event, store) {
  const obj = event.data.object;
  const orderId = obj.metadata?.pit_order_id;
  const order = store.row('SELECT * FROM orders WHERE id=?', orderId);
  if (!order) fail('unknown Stripe order');
  const kinds = {
    'checkout.session.completed': 'paid',
    'invoice.paid': 'paid',
    'invoice.payment_failed': 'failed',
    'customer.subscription.deleted': 'canceled',
    'charge.refunded': 'refunded',
    'charge.dispute.created': 'refunded',
  };
  const kind = kinds[event.type]; if (!kind) fail('unsupported Stripe event');
  if (kind === 'paid' && obj.payment_status !== 'paid' && event.type === 'checkout.session.completed') fail('Stripe session not paid');
  return { provider: 'stripe-test', eventId: event.id, paymentId: obj.payment_intent ?? obj.id, orderId, userId: obj.metadata?.pit_user_id, cents: obj.amount_total ?? obj.amount_paid ?? obj.amount, currency: String(obj.currency ?? '').toUpperCase(), kind, digest: digest(JSON.stringify(event)), periodEnd: obj.metadata?.pit_period_end };
}

export function processStripeWebhook(store, raw, header, secret, now) {
  const verified = verifyStripeWebhook(raw, header, secret, Math.floor(Date.parse(now) / 1000));
  return store.payment(stripePaymentEvent(verified, store), now);
}

// CoinGate's callback alone is not settlement proof. This mock adapter accepts
// only a trusted order-readback fixture; no live API, token or payout address.
export function mockCoinGateSettlement(store, invoice, readback, now) {
  const order = store.row('SELECT * FROM orders WHERE id=?', invoice.orderId);
  const stored=store.row('SELECT * FROM crypto_invoices WHERE order_id=?',invoice.orderId);
  if (!validMockInvoice(invoice,order) || !sameStoredInvoice(invoice,stored) || !same(invoice.callbackToken, readback.callbackToken) ||
      readback.orderId !== order.id || readback.status !== 'paid' ||
      readback.priceCents !== order.cents || readback.currency !== 'EUR' ||
      !sameSettlement(invoice,readback) ||
      now > invoice.expiresAt || !readback.confirmed) fail('crypto settlement unverified');
  const current=store.snapshot(order.user_id,now);
  const anchor=current.plan==='pro' && current.subscription.periodEnd>now ? current.subscription.periodEnd : now;
  const periodEnd=order.sku==='pro' ? new Date(Date.parse(anchor)+30*86400000).toISOString() : undefined;
  return store.payment({ provider: 'coingate-mock', eventId: readback.eventId, paymentId: readback.transactionId, orderId: order.id, userId: order.user_id, cents: order.cents, currency: 'EUR', kind: 'paid', digest: digest(JSON.stringify(readback)),periodEnd }, now);
}

export function mockCoinGateReversal(store, invoice, readback, now) {
  const order = store.row('SELECT * FROM orders WHERE id=?', invoice.orderId);
  const stored=store.row('SELECT * FROM crypto_invoices WHERE order_id=?',invoice.orderId);
  if (!validMockInvoice(invoice,order) || !sameStoredInvoice(invoice,stored) || !same(invoice.callbackToken, readback.callbackToken) ||
      readback.orderId !== order.id || readback.status !== 'refunded' ||
      readback.priceCents !== order.cents || readback.currency !== 'EUR' ||
      !sameSettlement(invoice,readback) ||
      !readback.reconciled) fail('crypto reversal unverified');
  return store.payment({ provider: 'coingate-mock', eventId: readback.eventId, paymentId: readback.transactionId, orderId: order.id, userId: order.user_id, cents: order.cents, currency: 'EUR', kind: 'refunded', digest: digest(JSON.stringify(readback)) }, now);
}

export function x402Challenge({ resourceUrl, operationId, network, asset, amount, payTo }) {
  if (!/^https:\/\//.test(resourceUrl) || network!==BASE_NETWORK || asset?.toLowerCase()!==BASE_USDC.toLowerCase() || !/^0x[a-fA-F0-9]{40}$/.test(payTo) || !/^[1-9]\d{0,11}$/.test(amount)) fail('invalid x402 mock requirements');
  return { x402Version: 2, error: 'PAYMENT-SIGNATURE header is required', resource: { url: resourceUrl, description: `Mock ${operationId}`, mimeType: 'application/json' }, accepts: [{ scheme: 'exact', network, amount, asset, payTo, maxTimeoutSeconds: 60 }] };
}

// A facilitator test double must verify AND settle. No account credits are minted.
export async function mockX402Resource(store, challenge, payload, facilitator, operationId, now, deliver) {
  if (!payload) return { status: 402, headers: { 'PAYMENT-REQUIRED': Buffer.from(JSON.stringify(challenge)).toString('base64') } };
  if (challenge.x402Version !== 2 || challenge.resource.description !== `Mock ${operationId}` || !facilitator) fail('invalid x402 context');
  const verified = await facilitator.verify(payload, challenge);
  if (!verified?.valid || verified.operationId !== operationId) fail('x402 verification failed');
  const settled = await facilitator.settle(payload, challenge);
  if (!settled?.success || settled.operationId !== operationId || !settled.paymentId) fail('x402 settlement failed');
  const result = store.tx(() => {
    store.run('INSERT INTO paid_operations VALUES (?,?,?)', settled.paymentId, operationId, now);
    return deliver();
  });
  return { status: 200, headers: { 'PAYMENT-RESPONSE': Buffer.from(JSON.stringify({ success: true, transaction: settled.paymentId, network: challenge.accepts[0].network })).toString('base64') }, body: result };
}
