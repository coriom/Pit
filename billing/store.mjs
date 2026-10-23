import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { CATALOG, PREMIUM_OPERATIONS } from './catalog.mjs';

const ident = value => typeof value === 'string' && /^[a-zA-Z0-9:_-]{1,96}$/.test(value);
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const assert = (ok, message) => { if (!ok) throw new Error(message); };

export class BillingStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
    this.db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  }
  close() { this.db.close(); }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  row(sql, ...args) { return this.db.prepare(sql).get(...args); }
  run(sql, ...args) { return this.db.prepare(sql).run(...args); }
  user(id, now) {
    assert(ident(id) && iso(now), 'invalid identity or time');
    return this.tx(() => {
      this.run('INSERT INTO users VALUES (?,?)', id, now);
      this.run('INSERT INTO wallets(user_id) VALUES (?)', id);
      this.run("INSERT INTO subscriptions(user_id,status) VALUES (?,'inactive')", id);
      return this.snapshot(id, now);
    });
  }
  snapshot(id, now) {
    assert(ident(id) && iso(now), 'invalid identity or time');
    const wallet = this.row('SELECT credits,frozen,unrecovered FROM wallets WHERE user_id=?', id);
    assert(wallet, 'unknown user');
    const sub = this.row('SELECT status,period_end,cancel_at_period_end FROM subscriptions WHERE user_id=?', id);
    const active = sub.status === 'active' && sub.period_end > now;
    return { userId: id, plan: active ? 'pro' : 'free', credits: wallet.credits, frozen: !!wallet.frozen, unrecovered: wallet.unrecovered, subscription: { status: active ? (sub.cancel_at_period_end ? 'canceling' : 'active') : sub.status === 'active' ? 'expired' : sub.status, periodEnd: sub.period_end } };
  }
  order({ id, userId, sku, expiresAt }) {
    assert(ident(id) && ident(userId) && iso(expiresAt), 'invalid order');
    const item = CATALOG[sku]; assert(item && item.kind !== 'free', 'unknown paid sku');
    return this.tx(() => {
      assert(this.row('SELECT 1 FROM users WHERE id=?', userId), 'unknown user');
      this.run("INSERT INTO orders(id,user_id,sku,cents,credits,status,expires_at) VALUES (?,?,?,?,?,'pending',?)", id, userId, sku, item.cents, item.credits ?? item.monthlyCredits, expiresAt);
      return this.row('SELECT * FROM orders WHERE id=?', id);
    });
  }
  #credit(userId, amount, kind, source, now) {
    assert(Number.isSafeInteger(amount) && amount > 0 && ident(source) && iso(now), 'invalid credit');
    const wallet = this.row('SELECT credits,unrecovered FROM wallets WHERE user_id=?', userId);
    assert(wallet, 'unknown user');
    const offset = Math.min(amount, wallet.unrecovered);
    this.run('UPDATE wallets SET credits=credits+?, unrecovered=unrecovered-? WHERE user_id=?', amount - offset, offset, userId);
    this.run('INSERT INTO ledger VALUES (?,?,?,?,?,?)', `ledger:${source}`, userId, amount, kind, source, now);
    if (offset) this.run('INSERT INTO ledger VALUES (?,?,?,?,?,?)', `ledger:recovery:${source}`, userId, -offset, 'liability-recovery', `recovery:${source}`, now);
  }
  debit(userId, amount, source, now, { testOnly = false } = {}) {
    assert(testOnly && Number.isSafeInteger(amount) && amount > 0 && ident(source) && iso(now), 'premium operation not enabled');
    return this.tx(() => {
      const update = this.run('UPDATE wallets SET credits=credits-? WHERE user_id=? AND frozen=0 AND unrecovered=0 AND credits>=?', amount, userId, amount);
      assert(update.changes === 1, 'insufficient or frozen balance');
      this.run('INSERT INTO ledger VALUES (?,?,?,?,?,?)', `ledger:${source}`, userId, -amount, 'operation', source, now);
      return this.snapshot(userId, now);
    });
  }
  spend(userId, operationId, source, now) {
    const op = PREMIUM_OPERATIONS[operationId];
    assert(op?.enabled, 'premium operation unavailable');
    return this.debit(userId, op.credits, source, now);
  }
  chargeLocalReport(userId, operationId, requestId, inputDigest, now) {
    const op = PREMIUM_OPERATIONS[operationId];
    assert(op?.localTest === true && op.enabled === false && ident(userId) && ident(requestId) && /^[a-f0-9]{64}$/.test(inputDigest) && iso(now), 'invalid local report request');
    return this.tx(() => {
      const prior = this.row('SELECT user_id,operation_id,input_digest,credits FROM report_receipts WHERE user_id=? AND request_id=?', userId, requestId);
      if (prior) {
        assert(prior.operation_id === operationId && prior.input_digest === inputDigest, 'report idempotency collision');
        const wallet = this.row('SELECT frozen,unrecovered FROM wallets WHERE user_id=?', userId);
        assert(wallet && !wallet.frozen && !wallet.unrecovered, 'frozen balance');
        return { charged: false, credits: prior.credits };
      }
      const update = this.run('UPDATE wallets SET credits=credits-? WHERE user_id=? AND frozen=0 AND unrecovered=0 AND credits>=?', op.credits, userId, op.credits);
      assert(update.changes === 1, 'insufficient or frozen balance');
      this.run('INSERT INTO ledger VALUES (?,?,?,?,?,?)', `report:${userId}:${requestId}`, userId, -op.credits, 'premium-report', `report:${userId}:${requestId}`, now);
      this.run('INSERT INTO report_receipts VALUES (?,?,?,?,?,?)', userId, requestId, operationId, inputDigest, op.credits, now);
      return { charged: true, credits: op.credits };
    });
  }
  #reverse(userId, amount, source, now) {
    assert(Number.isSafeInteger(amount) && amount > 0 && ident(source) && iso(now), 'invalid reversal');
    const wallet = this.row('SELECT credits FROM wallets WHERE user_id=?', userId);
    assert(wallet, 'unknown user');
    const recovered = Math.min(amount, wallet.credits), deficit = amount - recovered;
    this.run('UPDATE wallets SET credits=credits-?, unrecovered=unrecovered+?, frozen=1 WHERE user_id=?', recovered, deficit, userId);
    this.run('INSERT INTO reversals VALUES (?,?,?,?,?,?)', source, userId, amount, recovered, deficit, now);
    if (recovered) this.run('INSERT INTO ledger VALUES (?,?,?,?,?,?)', `ledger:${source}`, userId, -recovered, 'reversal', source, now);
    return { recovered, deficit };
  }
  payment(event, now) {
    assert(iso(now) && ident(event.provider) && ident(event.eventId) && ident(event.orderId) && ident(event.paymentId) && ident(event.digest), 'invalid verified payment event');
    assert(['paid','refunded','failed','canceled'].includes(event.kind), 'invalid event kind');
    return this.tx(() => {
      const prior = this.row('SELECT payload_digest FROM payment_events WHERE provider=? AND event_id=?', event.provider, event.eventId);
      if (prior) { assert(prior.payload_digest === event.digest, 'event id collision'); return { duplicate: true }; }
      const order = this.row('SELECT * FROM orders WHERE id=?', event.orderId);
      assert(order && order.cents === event.cents && event.currency === 'EUR', 'order amount or currency mismatch');
      if (event.userId) assert(order.user_id === event.userId, 'order account mismatch');
      this.run('INSERT INTO payment_events VALUES (?,?,?,?,?,?)', event.provider, event.eventId, event.digest, event.orderId, event.kind, now);
      if (event.kind === 'paid') {
        if (order.status !== 'pending') return { ignored: order.status };
        assert(now <= order.expires_at, 'expired order');
        this.run("UPDATE orders SET status='paid',paid_at=?,provider=?,provider_payment_id=? WHERE id=?", now, event.provider, event.paymentId, order.id);
        this.#credit(order.user_id, order.credits, 'purchase', `purchase:${order.id}`, now);
        if (order.sku === 'pro') {
          const periodEnd = event.periodEnd;
          assert(iso(periodEnd) && periodEnd > now, 'invalid subscription period');
          this.run("UPDATE subscriptions SET status='active',period_start=?,period_end=?,cancel_at_period_end=0 WHERE user_id=?", now, periodEnd, order.user_id);
        }
      } else if (event.kind === 'refunded') {
        if (order.status === 'refunded') return { ignored: 'refunded' };
        if (order.status === 'paid') assert(event.provider === order.provider && event.paymentId === order.provider_payment_id, 'refund payment mismatch');
        this.run("UPDATE orders SET status='refunded' WHERE id=?", order.id);
        if (order.status === 'paid') this.#reverse(order.user_id, order.credits, `refund:${order.id}`, now);
        if (order.sku === 'pro' && order.status === 'paid') this.run("UPDATE subscriptions SET status='canceled',cancel_at_period_end=0 WHERE user_id=? AND period_start=?", order.user_id, order.paid_at);
      } else if (event.kind === 'failed' && order.sku === 'pro') {
        if (order.status === 'pending') this.run("UPDATE subscriptions SET status='past_due' WHERE user_id=? AND status='active' AND period_end<=?", order.user_id, now);
      } else if (event.kind === 'canceled' && order.sku === 'pro') {
        if (order.status === 'paid') this.run('UPDATE subscriptions SET cancel_at_period_end=1 WHERE user_id=? AND period_start=?', order.user_id, order.paid_at);
      }
      return { applied: true, balance: this.snapshot(order.user_id, now) };
    });
  }
  expire(userId, now) {
    assert(iso(now), 'invalid time');
    return this.tx(() => {
      this.run("UPDATE subscriptions SET status='expired' WHERE user_id=? AND period_end<=? AND status IN ('active','past_due')", userId, now);
      this.run("UPDATE orders SET status='expired' WHERE user_id=? AND status='pending' AND expires_at<?", userId, now);
      return this.snapshot(userId, now);
    });
  }
  ledger(userId) { assert(ident(userId), 'invalid identity'); return this.db.prepare('SELECT delta,kind,source,created_at FROM ledger WHERE user_id=? ORDER BY rowid').all(userId); }
}
