// PIT_STAGING_ACCEPTANCE_ONLY: sanitize untrusted Vercel errors before evidence is written.
const sensitiveKey = /secret|token|password|authorization|cookie|credential|key/i;

export function redactDiagnostic(value, secret, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  if (typeof value === "string") {
    let text = secret ? value.replaceAll(secret, "[REDACTED]") : value;
    text = text.replace(/https?:\/\/[^\s"'<>]+/gi, "[URL]")
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
      .replace(/\b(secret|token|password|authorization|cookie|credential|key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
      .replace(/[A-Za-z0-9_-]{32,}/g, "[REDACTED_VALUE]")
      .replace(/[^\x20-\x7e]/g, " ");
    return text.slice(0, 240);
  }
  if (Array.isArray(value)) return value.slice(0, 10).map((item) => redactDiagnostic(item, secret, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 20).map(([key, item]) => [
      redactDiagnostic(key, secret, depth + 1).slice(0, 64),
      sensitiveKey.test(key) ? "[REDACTED]" : redactDiagnostic(item, secret, depth + 1),
    ]));
  }
  return typeof value === "number" || typeof value === "boolean" || value === null ? value : null;
}

export function safeDiagnostic(error, secret) {
  if (!/^VERCEL_HTTP_[1-5][0-9]{2}$/.test(error?.safeCode ?? "")) return undefined;
  const value = error?.diagnostic;
  if (!value || typeof value !== "object") return undefined;
  // Re-sanitize even internal diagnostic objects before crossing into a report.
  const sanitized = redactDiagnostic(value, secret);
  const requestId = typeof value.requestId === "string" && /^[A-Za-z0-9:_-]{3,128}$/.test(value.requestId) &&
    (!secret || !value.requestId.includes(secret)) ? value.requestId : null;
  return {
    httpStatus: Number.isInteger(sanitized.httpStatus) ? sanitized.httpStatus : null,
    code: typeof sanitized.code === "string" ? sanitized.code : null,
    message: typeof sanitized.message === "string" ? sanitized.message : "UNAVAILABLE",
    requestId,
    at: typeof sanitized.at === "string" ? sanitized.at : null,
    requestFields: Array.isArray(sanitized.requestFields) ? sanitized.requestFields : [],
  };
}

export async function httpFailureDiagnostic(response, secret, requestFields, now = () => new Date().toISOString()) {
  let body;
  try { body = redactDiagnostic(JSON.parse(await response.text()), secret); }
  catch { body = null; }
  const error = body?.error && typeof body.error === "object" ? body.error : body;
  const code = typeof error?.code === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.code)
    ? error.code : null;
  const message = typeof error?.message === "string" ? error.message : "UNAVAILABLE_OR_MALFORMED_ERROR_BODY";
  const rawRequestId = response.headers.get("x-vercel-id") ?? response.headers.get("x-vercel-request-id");
  const requestId = typeof rawRequestId === "string" && /^[A-Za-z0-9:_-]{3,128}$/.test(rawRequestId) &&
    !rawRequestId.includes(secret) ? rawRequestId : null;
  return { httpStatus: response.status, code, message, requestId, at: now(), requestFields };
}
