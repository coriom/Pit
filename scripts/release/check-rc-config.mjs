// A production candidate is a separate, explicitly approved artifact. This tracked
// template must never contain a live merchant, chain, token, router or price.
import { readFileSync } from "node:fs";
const config = JSON.parse(readFileSync("deployments/pit-production-template.json", "utf8"));
const required = ["chainId", "canonicalCircleUsdc", "merchantFeeRecipient", "merchantOwnershipEvidence",
  "priceAdministrator", "priceGovernance", "approvedPriceVersion", "approvedFeesMicroUsdc",
  "paidTokenCreator", "paidOperations", "independentAuditReference", "legalApprovalReference",
  "walletExtensionAcceptanceReference"];
if (config.schema !== "pit.production-payment-candidate.v1" || config.enabled !== false
  || config.status !== "UNCONFIGURED_DO_NOT_DEPLOY"
  || required.some((key) => !Object.hasOwn(config, key) || config[key] !== null))
  throw Error("Production payment template is unexpectedly configured or enabled");
if (Object.keys(config).length !== required.length + 3) throw Error("Unexpected production payment setting");
console.log("PRODUCTION PAYMENT TEMPLATE PASS: disabled; all commercial identities and destinations unresolved");
