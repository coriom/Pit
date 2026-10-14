// PIT_STAGING_ACCEPTANCE_ONLY: deterministic orchestration; all effects are injected.
export function safeFailure(error) {
  // Never serialize an upstream error, response body, request, or nested cause.
  if (/^VERCEL_HTTP_[1-5][0-9]{2}$/.test(error?.safeCode ?? "")) return error.safeCode;
  if (["VERCEL_REQUEST_TIMEOUT", "VERCEL_REQUEST_UNAVAILABLE", "LOCAL_SECRET_WRITE_FAILED"].includes(error?.safeCode)) return error.safeCode;
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
    creationResponse = "HTTP_SUCCESS";
    mark("CREDENTIAL_CREATION", { status: "HTTP_SUCCESS" });
  } catch (error) {
    creationResponse = "FAILED_OR_UNKNOWN";
    failure = "CREDENTIAL_CREATION_FAILED";
    mark("CREDENTIAL_CREATION", { status: "FAILED_OR_UNKNOWN", reason: safeFailure(error) });
  }

  if (!failure) {
    try {
      const access = await ops.checkAccess(secret);
      accessEstablished = access.status === 200 && access.csp === true;
      mark("BYPASS_HTTP_AUTHENTICATION", { status: accessEstablished ? "HTTP_200_PIT" : "ACCESS_NOT_ESTABLISHED", httpStatus: access.status });
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
    mark("REVOKE_REQUEST", { status: revokeRequest, reason: safeFailure(error) });
  }

  try {
    revocation = await ops.verifyRevocation(secret, (state) => mark("REVOKE_CONFIRMATION", { status: state }));
  } catch (error) {
    revocation = "SECURITY_STATUS_UNKNOWN";
    mark("REVOKE_CONFIRMATION", { status: revocation, reason: safeFailure(error) });
  }

  if (revocation === "REVOCATION_CONFIRMED") {
    try {
      await ops.deleteSecret();
      mark("LOCAL_SECRET_DELETION", { status: "PASS" });
    } catch (error) {
      failure ??= "STAGING_ACCEPTANCE_BLOCKED";
      mark("LOCAL_SECRET_DELETION", { status: "BLOCKED", reason: safeFailure(error) });
    }
  }

  const status = revocation === "CREDENTIAL_STILL_ACCEPTED" ? "CREDENTIAL_STILL_ACCEPTED"
    : revocation !== "REVOCATION_CONFIRMED" ? "SECURITY_STATUS_UNKNOWN"
    : revokeRequest === "REVOCATION_REQUEST_FAILED" ? "REVOCATION_REQUEST_FAILED"
    : failure ?? (browserPassed ? "PASS" : "STAGING_ACCEPTANCE_BLOCKED");
  return { status, failure, creationResponse, revokeRequest, revocation, browserPassed, timeline };
}

export async function confirmRevocation(secret, ops, onObservation = (_state) => {}) {
  let last = "SECURITY_STATUS_UNKNOWN";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const [project, oldAccess, anonymousAccess] = await Promise.all([
        ops.projectState(), ops.protectedRead(secret), ops.protectedRead(),
      ]);
      const entries = Object.keys(project.protectionBypass ?? {});
      last = entries.length === 0 && oldAccess.status === 302 && anonymousAccess.status === 302
        ? "REVOCATION_CONFIRMED"
        : entries.length > 0 || oldAccess.status === 200
          ? "CREDENTIAL_STILL_ACCEPTED" : "SECURITY_STATUS_UNKNOWN";
    } catch {
      last = "SECURITY_STATUS_UNKNOWN";
    }
    onObservation(last === "REVOCATION_CONFIRMED" || attempt === 3 ? last : "REVOCATION_PENDING_CONFIRMATION");
    if (last === "REVOCATION_CONFIRMED") return last;
    if (attempt < 3) await ops.sleep(2500);
  }
  return last;
}
