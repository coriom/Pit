// PIT_STAGING_ACCEPTANCE_ONLY: deterministic orchestration; all effects are injected.
import { safeDiagnostic } from "./staging-diagnostics.mjs";

export function safeFailure(error) {
  // Never serialize an upstream error, response body, request, or nested cause.
  if (/^VERCEL_HTTP_[1-5][0-9]{2}$/.test(error?.safeCode ?? "")) return error.safeCode;
  if (["VERCEL_REQUEST_TIMEOUT", "VERCEL_REQUEST_UNAVAILABLE", "VERCEL_UNEXPECTED_STATUS", "LOCAL_SECRET_WRITE_FAILED", "INVALID_MUTATION_REQUEST"].includes(error?.safeCode)) return error.safeCode;
  return "UNCLASSIFIED_ERROR";
}

export async function runLifecycle(ops) {
  const timeline = [];
  const mark = (state, detail = {}) => timeline.push({ at: ops.now(), state, ...detail });
  let secret;
  let failure = null;
  let accessEstablished = false;
  let browserPassed = false;
  let creationResponse = "NOT_SENT";
  let revokeRequest = "NOT_SENT";
  let revocation = "NOT_REQUIRED";

  try {
    await ops.preflight();
    mark("PREFLIGHT", { status: "PASS" });
  } catch (error) {
    mark("PREFLIGHT", { status: "BLOCKED", reason: safeFailure(error) });
    return { status: "STAGING_ACCEPTANCE_BLOCKED", failure: "PREFLIGHT", creationResponse, revokeRequest, revocation, timeline };
  }

  try {
    secret = await ops.retainSecret();
    mark("CREDENTIAL_RETAINED", { status: "PASS" });
  } catch (error) {
    mark("CREDENTIAL_RETAINED", { status: "BLOCKED", reason: safeFailure(error) });
    return { status: "CREDENTIAL_CREATION_FAILED", failure: "LOCAL_RETENTION", creationResponse, revokeRequest, revocation, timeline };
  }

  try {
    await ops.createRemote(secret);
    creationResponse = "CREATION_CONFIRMED";
    mark("CREDENTIAL_CREATION", { status: creationResponse });
  } catch (error) {
    creationResponse = error?.safeCode === "VERCEL_HTTP_400" ? "CREATION_REJECTED" : "UNKNOWN";
    failure = creationResponse === "CREATION_REJECTED" ? "CREATION_REJECTED" : "CREDENTIAL_CREATION_FAILED";
    const diagnostic = safeDiagnostic(error, secret);
    mark("CREDENTIAL_CREATION", { status: creationResponse, reason: safeFailure(error), ...(diagnostic ? { diagnostic } : {}) });
  }

  if (!failure) {
    try {
      const access = await ops.checkAccess(secret);
      accessEstablished = access.status === 200 && access.csp === true;
      mark("BYPASS_HTTP_AUTHENTICATION", { status: accessEstablished ? "ACCESS_CONFIRMED" : "ACCESS_NOT_ESTABLISHED", httpStatus: access.status });
      if (!accessEstablished) failure = "ACCESS_NOT_ESTABLISHED";
    } catch (error) {
      failure = "ACCESS_NOT_ESTABLISHED";
      mark("BYPASS_HTTP_AUTHENTICATION", { status: failure, reason: safeFailure(error) });
    }
  }

  if (accessEstablished) {
    try {
      mark("BROWSER_WORKFLOW", { status: "INVOKED" });
      await ops.runBrowser(secret);
      browserPassed = true;
      mark("STAGING_TEST", { status: "PASS" });
    } catch (error) {
      failure = "STAGING_ACCEPTANCE_BLOCKED";
      mark("STAGING_TEST", { status: "BLOCKED", reason: safeFailure(error) });
    }
  }

  try {
    await ops.revokeRemote(secret);
    revokeRequest = "HTTP_SUCCESS";
    mark("REVOKE_REQUEST", { status: revokeRequest });
  } catch (error) {
    revokeRequest = "REVOCATION_REQUEST_FAILED";
    const diagnostic = safeDiagnostic(error, secret);
    mark("REVOKE_REQUEST", { status: revokeRequest, reason: safeFailure(error), ...(diagnostic ? { diagnostic } : {}) });
  }

  try {
    revocation = await ops.verifyRevocation(secret, (state) => mark("REVOKE_CONFIRMATION", { status: state }), { creationResponse, revokeRequest });
  } catch (error) {
    revocation = "SECURITY_STATUS_UNKNOWN";
    mark("REVOKE_CONFIRMATION", { status: revocation, reason: safeFailure(error) });
  }

  if (["REVOCATION_CONFIRMED", "NO_ACTIVE_BYPASS_OBSERVED"].includes(revocation)) {
    try {
      await ops.deleteSecret();
      mark("LOCAL_SECRET_DELETION", { status: "PASS" });
    } catch (error) {
      failure ??= "STAGING_ACCEPTANCE_BLOCKED";
      mark("LOCAL_SECRET_DELETION", { status: "BLOCKED", reason: safeFailure(error) });
    }
  }

  const status = revocation === "CREDENTIAL_STILL_ACCEPTED" ? "CREDENTIAL_STILL_ACCEPTED"
    : !["REVOCATION_CONFIRMED", "NO_ACTIVE_BYPASS_OBSERVED"].includes(revocation) ? "SECURITY_STATUS_UNKNOWN"
    : creationResponse === "CREATION_REJECTED" ? "CREATION_REJECTED"
    : revocation === "NO_ACTIVE_BYPASS_OBSERVED" ? failure ?? "NO_ACTIVE_BYPASS_OBSERVED"
    : revokeRequest === "REVOCATION_REQUEST_FAILED" ? "REVOCATION_REQUEST_FAILED"
    : failure ?? (browserPassed ? "PASS" : "STAGING_ACCEPTANCE_BLOCKED");
  return { status, failure, creationResponse, revokeRequest, revocation, browserPassed, timeline };
}

export async function confirmRevocation(secret, ops, onObservation = (_state) => {}, context = {}) {
  let last = "SECURITY_STATUS_UNKNOWN";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [project, oldAccess, anonymousAccess] = await Promise.all([
        ops.projectState(), ops.protectedRead(secret), ops.protectedRead(),
      ]);
      if (!Object.prototype.hasOwnProperty.call(project, "protectionBypass") ||
        !project.protectionBypass || typeof project.protectionBypass !== "object" ||
        Array.isArray(project.protectionBypass)) throw Error("Bypass metadata unavailable");
      const entries = Object.keys(project.protectionBypass);
      last = entries.length === 0 && oldAccess.status === 302 && anonymousAccess.status === 302
        ? context.creationResponse === "CREATION_CONFIRMED" && context.revokeRequest === "HTTP_SUCCESS"
          ? "REVOCATION_CONFIRMED" : "NO_ACTIVE_BYPASS_OBSERVED"
        : entries.length > 0 || oldAccess.status === 200
          ? "CREDENTIAL_STILL_ACCEPTED" : "SECURITY_STATUS_UNKNOWN";
    } catch {
      last = "SECURITY_STATUS_UNKNOWN";
    }
    onObservation(["REVOCATION_CONFIRMED", "NO_ACTIVE_BYPASS_OBSERVED"].includes(last) || attempt === 3 ? last : "REVOCATION_PENDING_CONFIRMATION");
    if (["REVOCATION_CONFIRMED", "NO_ACTIVE_BYPASS_OBSERVED"].includes(last)) return last;
    if (attempt < 3) await ops.sleep(2500);
  }
  return last;
}
