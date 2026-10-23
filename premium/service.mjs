import { createHash } from 'node:crypto';
import { LocalBillingApi } from '../billing/local-api.mjs';
import { PREMIUM_OPERATIONS } from '../billing/catalog.mjs';

const operationRunner = Object.freeze({
  'portfolio-batch-risk': 'portfolioBatchRisk',
  'trading-journal-advanced': 'advancedTradingJournal',
});

export class PremiumLocalService {
  constructor(store, fixtureTokens, reports) {
    this.store = store;
    this.account = new LocalBillingApi(store, fixtureTokens);
    this.reports = reports;
  }
  me(token, now) { return this.account.me(token, now); }
  history(token) { return this.account.history(token); }
  run(token, { operationId, requestId, input }, now) {
    const userId = this.account.principal(token);
    const name = operationRunner[operationId];
    if (!name || PREMIUM_OPERATIONS[operationId]?.localTest !== true || typeof requestId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(requestId)) throw new Error('invalid local premium request');
    const serialized = JSON.stringify(input);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > 65536) throw new Error('report input exceeds 64 KiB');
    const reportBundle = this.reports[name](input); // validate and calculate before debit
    const payload = JSON.stringify(reportBundle); // fail before debit if output cannot serialize
    if (Buffer.byteLength(payload) > 262144) throw new Error('report output exceeds 256 KiB');
    const digest = createHash('sha256').update(JSON.stringify([operationId, input])).digest('hex');
    const receipt = this.store.chargeLocalReport(userId, operationId, requestId, digest, now);
    return { ...JSON.parse(payload), receipt: { requestId, credits: receipt.credits, charged: receipt.charged }, entitlement: this.store.snapshot(userId, now) };
  }
}
