import { createHmac } from 'node:crypto';
import { BillingStore } from './store.mjs';
import { LocalBillingApi } from './local-api.mjs';
import { processStripeWebhook } from './payments.mjs';

const now = '2026-10-23T00:00:00.000Z';
const secret = 'whsec_local_fixture_only';
const store = new BillingStore();
store.user('fixture-user', now);
const local = new LocalBillingApi(store, [['fixture-only-token', 'fixture-user']]);
local.order('fixture-only-token', 'fixture-order', 'pack5', '2026-10-24T00:00:00.000Z');
const event = { id: 'fixture-event', type: 'checkout.session.completed', data: { object: { id: 'fixture-payment', payment_status: 'paid', amount_total: 500, currency: 'eur', metadata: { pit_order_id: 'fixture-order', pit_user_id: 'fixture-user' } } } };
const raw = JSON.stringify(event), timestamp = Math.floor(Date.parse(now)/1000);
const header = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`;
processStripeWebhook(store, raw, header, secret, now);
local.simulateDebit('fixture-only-token', 3, 'test:enhanced-export', now);
console.log(JSON.stringify({ entitlement: local.me('fixture-only-token', now), ledger: local.history('fixture-only-token'), note: 'Local simulated payment only; no real checkout, Worker or public API exists.' }, null, 2));
store.close();
