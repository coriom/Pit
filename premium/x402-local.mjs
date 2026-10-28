import { createHash, randomBytes } from "node:crypto";
import { portfolioBatchRisk } from "../dist-premium-local/reports.mjs";

// Test-only state machine shaped like x402 v2's exact authorization flow.
// It does not sign EIP-3009 authorizations, contact a facilitator, or settle real assets.
export const LOCAL_REPORT_PRICE_MICRO = 4_900_000n;
const asset = "LOCAL_MOCK_USDC_ONLY";
const network = "eip155:31337";
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64");
const digest = (input) => createHash("sha256").update(JSON.stringify(input)).digest("hex");

export class SimulatedFacilitator {
  #issued = new Map();
  #settled = new Set();
  #uncertain = new Set();
  issueFixturePayment(requestId, inputDigest) {
    const proof = randomBytes(24).toString("hex");
    this.#issued.set(proof, { requestId, inputDigest, spent: false });
    return proof;
  }
  verify(proof, requestId, inputDigest) {
    const item = this.#issued.get(proof);
    return !!item && !item.spent && item.requestId === requestId && item.inputDigest === inputDigest;
  }
  markUncertain(requestId) { this.#uncertain.add(requestId); }
  settle(proof, requestId) {
    const item = this.#issued.get(proof);
    if (!item || item.spent || item.requestId !== requestId) throw Error("simulated settlement rejected");
    if (this.#uncertain.has(requestId)) throw Error("simulated settlement uncertain");
    item.spent = true; this.#settled.add(requestId);
    return { status: "SIMULATED_SETTLED", reference: `local-${requestId}` };
  }
  isSettled(requestId) { return this.#settled.has(requestId); }
}

export class LocalReportPaymentService {
  #requests = new Map();
  constructor(facilitator = new SimulatedFacilitator()) { this.facilitator = facilitator; }
  requirements(requestId) {
    return { x402Version: 2, error: "Payment required for one portfolio batch report", accepts: [{
      scheme: "exact", network, asset, amount: LOCAL_REPORT_PRICE_MICRO.toString(),
      payTo: "LOCAL_FIXTURE_ONLY", maxTimeoutSeconds: 900,
      extra: { simulation: true, operation: "portfolio-batch-risk", requestId },
    }] };
  }
  handle({ requestId, input, fixturePayment }) {
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(requestId ?? "")) return { status: 400, body: { error: "invalid request id" } };
    const inputDigest = digest(input);
    const current = this.#requests.get(requestId);
    if (current && current.digest !== inputDigest) return { status: 409, body: { error: "request id reused with different input" } };
    if (current?.state === "SETTLED") {
      try { return { status: 200, headers: { "PAYMENT-RESPONSE": encode(current.settlement) }, body: portfolioBatchRisk(input) }; }
      catch { return { status: 422, body: { error: "invalid report input" } }; }
    }
    if (current?.state === "PENDING") return { status: 503, body: { error: "settlement uncertain; reconcile before retry" } };
    if (!fixturePayment) return { status: 402, headers: { "PAYMENT-REQUIRED": encode(this.requirements(requestId)) }, body: { error: "local simulated payment required" } };
    if (!this.facilitator.verify(fixturePayment, requestId, inputDigest)) return { status: 402, body: { error: "local simulated payment verification failed" } };
    let report;
    try { report = portfolioBatchRisk(input); }
    catch { return { status: 422, body: { error: "invalid report input" } }; }
    // Generate first, settle second, deliver only after confirmed simulated settlement.
    // No imported or generated financial report is retained; only digest and settlement evidence remain in process memory.
    this.#requests.set(requestId, { digest: inputDigest, state: "PENDING" });
    let settlement;
    try { settlement = this.facilitator.settle(fixturePayment, requestId); }
    catch { return { status: 503, body: { error: "settlement uncertain; reconcile before retry" } }; }
    this.#requests.set(requestId, { digest: inputDigest, state: "SETTLED", settlement });
    return { status: 200, headers: { "PAYMENT-RESPONSE": encode(settlement) }, body: report };
  }
  reconcile(requestId) { return { settled: this.facilitator.isSettled(requestId), state: this.#requests.get(requestId)?.state ?? "UNSEEN" }; }
  inputDigest(input) { return digest(input); }
}
