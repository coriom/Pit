// Provisional local-test prices, not a public offer or approved unit economics.
export const CATALOG = Object.freeze({
  free: Object.freeze({ kind: 'free', cents: 0, monthlyCredits: 0 }),
  pro: Object.freeze({ kind: 'subscription', cents: 990, monthlyCredits: 100 }),
  pack5: Object.freeze({ kind: 'pack', cents: 500, credits: 50 }),
  pack10: Object.freeze({ kind: 'pack', cents: 1000, credits: 110 }),
  pack25: Object.freeze({ kind: 'pack', cents: 2500, credits: 300 }),
});

// Future operations are deliberately disabled: current 178 tasks stay free.
export const PREMIUM_OPERATIONS = Object.freeze({
  'portfolio-batch-risk': Object.freeze({ credits: 10, enabled: false, localTest: true }),
  'trading-journal-advanced': Object.freeze({ credits: 10, enabled: false, localTest: true }),
  'future-batch-report': Object.freeze({ credits: 10, enabled: false }),
  'future-ai-analysis': Object.freeze({ credits: 25, enabled: false }),
  'future-enhanced-export': Object.freeze({ credits: 3, enabled: false }),
});
