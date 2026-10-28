import test from "node:test";
import assert from "node:assert/strict";
import { portfolioExample } from "./examples.mjs";
import { LocalReportPaymentService, SimulatedFacilitator, X402_SETTLEMENT } from "./x402-local.mjs";

test("local x402-shaped exact flow requires fixture verification and settlement before result delivery", () => {
  assert.equal(X402_SETTLEMENT, "SIMULATED");
  const facilitator = new SimulatedFacilitator(), service = new LocalReportPaymentService(facilitator);
  const requestId = "portfolio-001";
  const unpaid = service.handle({ requestId, input: portfolioExample });
  assert.equal(unpaid.status, 402);
  const requirements = JSON.parse(Buffer.from(unpaid.headers["PAYMENT-REQUIRED"], "base64").toString());
  assert.equal(requirements.x402Version, 2);
  assert.equal(requirements.accepts[0].amount, "4900000");
  assert.equal(requirements.accepts[0].network, "eip155:31337");
  assert.equal(service.handle({ requestId, input: portfolioExample, fixturePayment: "forged" }).status, 402);
  const proof = facilitator.issueFixturePayment(requestId, service.inputDigest(portfolioExample));
  const paid = service.handle({ requestId, input: portfolioExample, fixturePayment: proof });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.report.allocation.total, "1000");
  assert.equal(service.reconcile(requestId).settled, true);
  assert.deepEqual(service.handle({ requestId, input: portfolioExample, fixturePayment: proof }), paid);
  assert.equal(service.handle({ requestId, input: { ...portfolioExample, currency: "EUR" }, fixturePayment: proof }).status, 409);
});

test("local x402-shaped flow fails closed on invalid report and uncertain settlement", () => {
  const facilitator = new SimulatedFacilitator(), service = new LocalReportPaymentService(facilitator);
  const invalidId = "portfolio-002";
  const invalidProof = facilitator.issueFixturePayment(invalidId, service.inputDigest({ bad: true }));
  assert.equal(service.handle({ requestId: invalidId, input: { bad: true }, fixturePayment: invalidProof }).status, 422);
  assert.equal(service.reconcile(invalidId).state, "UNSEEN");
  const requestId = "portfolio-003";
  const proof = facilitator.issueFixturePayment(requestId, service.inputDigest(portfolioExample));
  facilitator.markUncertain(requestId);
  assert.equal(service.handle({ requestId, input: portfolioExample, fixturePayment: proof }).status, 503);
  assert.deepEqual(service.reconcile(requestId), { settled: false, state: "PENDING" });
  assert.equal(service.handle({ requestId, input: portfolioExample, fixturePayment: proof }).status, 503);
});
