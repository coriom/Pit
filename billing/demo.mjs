import { BillingStore } from './store.mjs';
import { LocalBillingApi } from './local-api.mjs';
import { mockCoinGateSettlement } from './payments.mjs';

const now = '2026-10-23T00:00:00.000Z';
const store = new BillingStore();
store.user('fixture-user', now);
const local = new LocalBillingApi(store, [['fixture-only-token', 'fixture-user']]);
local.order('fixture-only-token', 'fixture-order', 'pack5', '2026-10-24T00:00:00.000Z');
const invoice=store.attachMockCryptoInvoice({orderId:'fixture-order',recipient:`0x${'2'.repeat(40)}`,atomicAmount:'5000000',issuedAt:now});
mockCoinGateSettlement(store,invoice,{...invoice,eventId:'fixture-event',transactionId:'fictional-payment',status:'paid',priceCents:500,currency:'EUR',confirmed:true},now);
local.simulateDebit('fixture-only-token', 3, 'test:enhanced-export', now);
console.log(JSON.stringify({ entitlement: local.me('fixture-only-token', now), ledger: local.history('fixture-only-token'), note: 'Local simulated payment only; no real checkout, Worker or public API exists.' }, null, 2));
store.close();
