// In-process only. There is intentionally no Worker fetch export or HTTP listener.
export class LocalBillingApi {
  constructor(store, fixtureTokens) { this.store = store; this.tokens = new Map(fixtureTokens); }
  principal(token) {
    const userId = this.tokens.get(token);
    if (!userId) throw new Error('authentication required');
    return userId;
  }
  me(token, now) { return this.store.snapshot(this.principal(token), now); }
  history(token) { return this.store.ledger(this.principal(token)); }
  order(token, id, sku, expiresAt) { return this.store.order({ id, userId: this.principal(token), sku, expiresAt }); }
  // Test-only debit, since no premium product is implemented or enabled.
  simulateDebit(token, credits, source, now) { return this.store.debit(this.principal(token), credits, source, now, { testOnly: true }); }
}
