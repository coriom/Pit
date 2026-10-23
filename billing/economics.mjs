import { CATALOG, PREMIUM_OPERATIONS } from './catalog.mjs';

// Micro-euros keep processor fractions exact. This is a screening model only;
// actual provider fees, VAT, refunds, FX and service costs must be measured.
export function packEconomics(sku, { feeBps, fixedCents }) {
  const product = CATALOG[sku];
  if (!product || product.kind === 'free' || !Number.isSafeInteger(feeBps) || feeBps < 0 || feeBps > 10000 || !Number.isSafeInteger(fixedCents) || fixedCents < 0) throw new Error('invalid cost assumptions');
  const grossMicroEur = BigInt(product.cents) * 10000n;
  const feeMicroEur = grossMicroEur * BigInt(feeBps) / 10000n + BigInt(fixedCents) * 10000n;
  const netMicroEur = grossMicroEur - feeMicroEur;
  const credits = BigInt(product.credits ?? product.monthlyCredits);
  return { sku, grossMicroEur: grossMicroEur.toString(), feeMicroEur: feeMicroEur.toString(), netMicroEur: netMicroEur.toString(), netPerCreditMicroEur: (netMicroEur / credits).toString(), economicallyPossible: netMicroEur > 0n };
}

export function screenFutureOperation(operationId, measuredMarginalCostMicroEur, overheadMicroEur, netPerCreditMicroEur) {
  const operation = PREMIUM_OPERATIONS[operationId];
  if (!operation) throw new Error('unknown future operation');
  if ([measuredMarginalCostMicroEur, overheadMicroEur, netPerCreditMicroEur].some(x => typeof x !== 'string' || !/^\d{1,16}$/.test(x))) return { status: 'INCOMPLETE', reason: 'measured cost and overhead required' };
  const revenue = BigInt(netPerCreditMicroEur) * BigInt(operation.credits);
  const cost = BigInt(measuredMarginalCostMicroEur) + BigInt(overheadMicroEur);
  return { status: revenue > cost ? 'MODEL_POSITIVE' : 'MODEL_NEGATIVE', revenueMicroEur: revenue.toString(), costMicroEur: cost.toString(), marginMicroEur: (revenue - cost).toString(), enabled: false };
}
