import { portfolioExample } from "./examples.mjs";
import { LocalReportPaymentService, SimulatedFacilitator } from "./x402-local.mjs";

const facilitator = new SimulatedFacilitator();
const service = new LocalReportPaymentService(facilitator);
const requestId = "fictional-demo-001";
const challenge = service.handle({ requestId, input: portfolioExample });
const proof = facilitator.issueFixturePayment(requestId, service.inputDigest(portfolioExample));
const settled = service.handle({ requestId, input: portfolioExample, fixturePayment: proof });
if (challenge.status !== 402 || settled.status !== 200 || service.reconcile(requestId).state !== "SETTLED") throw Error("Local report payment demonstration failed");
console.log(JSON.stringify({ mode: "LOCAL_SIMULATED_X402_SHAPED", challengeStatus: challenge.status,
  settlementStatus: service.reconcile(requestId).state, deliveryStatus: settled.status,
  reportVersion: settled.body.report.version ?? "portfolio-batch-risk", reportAssetCount: settled.body.report.coverage?.assets ?? null,
  realPayment: false, liveFacilitator: false, rawFinancialDataLogged: false }));
