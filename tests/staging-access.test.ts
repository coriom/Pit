import { describe, expect, it, vi } from "vitest";
import { generateSecretValue, mutateVercel, mutationFields } from "../scripts/audit/staging-access.mjs";
import { redactDiagnostic, safeDiagnostic } from "../scripts/audit/staging-diagnostics.mjs";
import { checkedProject, protectedRead, PROJECT_ID, scopedBypassHeaders, STAGING_ORIGIN } from "../scripts/audit/staging-readonly.mjs";

describe("test-only protected staging header scope", () => {
  const synthetic = "synthetic-test-only";
  const syntheticSecret = "S".repeat(32);

  it("applies a bypass only to the exact PIT HTTPS origin and removes credential state", () => {
    expect(scopedBypassHeaders(STAGING_ORIGIN + "/__pit-staging-accounting/", {
      Cookie: "synthetic-cookie",
      Authorization: "synthetic-auth",
      accept: "text/html",
    }, synthetic)).toEqual({ accept: "text/html", "x-vercel-protection-bypass": synthetic });
  });

  it.each([
    "https://api.cow.fi/api/v1/quote",
    "https://api.hyperliquid-testnet.xyz/info",
    "https://ethereum-sepolia-rpc.publicnode.com/",
    "https://ethereum-rpc.publicnode.com/",
    "https://pit-testnet-staging-corioms-projects.vercel.app.evil.example/",
    "http://pit-testnet-staging-corioms-projects.vercel.app/",
    "https://pit-testnet-staging-corioms-projects.vercel.app:444/",
    "https://user@pit-testnet-staging-corioms-projects.vercel.app/",
  ])("never forwards the bypass to another origin: %s", (url) => {
    expect(scopedBypassHeaders(url, {}, synthetic)).toBeNull();
  });

  it("refuses a missing local credential", () => {
    expect(() => scopedBypassHeaders(STAGING_ORIGIN, {}, "")).toThrow("Missing local staging credential");
  });

  it("requires explicit empty bypass metadata before treating a project as clear", () => {
    const project = { id: PROJECT_ID, name: "pit-testnet-staging", ssoProtection: { deploymentType: "all_except_custom_domains" } };
    expect(() => checkedProject(project)).toThrow("bypass metadata");
    expect(checkedProject({ ...project, protectionBypass: {} }).protectionBypass).toEqual({});
    expect(() => checkedProject({ ...project, protectionBypass: { fixture: {} } })).not.toThrow();
  });

  it("uses only the exact protected staging URL with a header and no redirect follow", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(null, { status: 302 }));
    expect(await protectedRead("synthetic-only", request)).toEqual({ status: 302, csp: null });
    expect(request).toHaveBeenCalledWith(STAGING_ORIGIN + "/__pit-staging-accounting/", expect.objectContaining({
      redirect: "manual",
      headers: { "x-vercel-protection-bypass": "synthetic-only" },
    }));
    expect(request.mock.calls[0][0]).not.toContain("synthetic-only");
  });

  it("sends a caller-supplied synthetic value to the official project API without logging the response", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response("synthetic response that must remain unread", { status: 200 }));
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await mutateVercel({ generate: { secret: syntheticSecret, note: "fixture" } }, { request, token: () => "inert-token" });
      expect(request).toHaveBeenCalledOnce();
      const [url, options] = request.mock.calls[0];
      expect(url).toBe("https://api.vercel.com/v1/projects/prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE/protection-bypass");
      expect(url).not.toContain(syntheticSecret);
      expect(new URL(String(url)).search).toBe("");
      expect(options?.method).toBe("PATCH");
      expect(options?.redirect).toBe("manual");
      expect(options?.headers).toEqual({ Authorization: "Bearer inert-token", "Content-Type": "application/json" });
      expect(JSON.parse(String(options?.body))).toEqual({ generate: { secret: syntheticSecret, note: "fixture" } });
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("generates exactly the documented 32-character alphanumeric secret shape", () => {
    const values = Array.from({ length: 20 }, () => generateSecretValue());
    expect(values.every((value) => /^[A-Za-z0-9]{32}$/.test(value))).toBe(true);
    expect(new Set(values).size).toBe(values.length);
    expect(mutationFields({ generate: { secret: syntheticSecret, note: "fixture" } }))
      .toEqual(["generate.secret:string[32-alphanumeric]", "generate.note:string[max100]"]);
  });

  it.each([
    { generate: { secret: "legacy-base64url_43_chars_were_not_valid____", note: "fixture" } },
    { generate: { secret: syntheticSecret, note: "n".repeat(101) } },
    { generate: { secret: syntheticSecret, note: 3 } },
    { revoke: { secret: syntheticSecret, regenerate: true } },
    { generate: { secret: syntheticSecret, note: "fixture" }, revoke: { secret: syntheticSecret, regenerate: false } },
    "{malformed JSON",
  ])("rejects invalid request fields before any HTTP call", async (body) => {
    const request = vi.fn();
    await expect(mutateVercel(body, { request, token: () => "inert-token" })).rejects.toThrow("INVALID_MUTATION_REQUEST");
    expect(request).not.toHaveBeenCalled();
  });

  it("captures a structured HTTP 400 with sanitized code, message, request ID, UTC and field types", async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      error: { code: "bad_request", message: `Invalid generate.secret ${syntheticSecret}; Bearer hidden-token; https://private.invalid/token` },
      nested: { authorization: syntheticSecret },
    }), { status: 400, headers: { "x-vercel-id": "iad1::abc-123" } }));
    try {
      await mutateVercel({ generate: { secret: syntheticSecret, note: "fixture" } }, { request, token: () => "inert-token" });
      throw Error("expected rejection");
    } catch (error: any) {
      expect(error.safeCode).toBe("VERCEL_HTTP_400");
      expect(error.diagnostic).toMatchObject({
        httpStatus: 400, code: "bad_request", requestId: "iad1::abc-123",
        requestFields: ["generate.secret:string[32-alphanumeric]", "generate.note:string[max100]"],
      });
      expect(error.diagnostic.at).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(JSON.stringify(error.diagnostic)).not.toContain(syntheticSecret);
      expect(JSON.stringify(error.diagnostic)).not.toContain("hidden-token");
      expect(JSON.stringify(error.diagnostic)).not.toContain("private.invalid");
    }
  });

  it.each(["{malformed JSON", ""])("keeps a 400 with malformed or absent JSON diagnostic, without inventing its cause", async (body) => {
    const request = vi.fn(async () => new Response(body, { status: 400 }));
    await expect(mutateVercel({ generate: { secret: syntheticSecret, note: "fixture" } }, { request, token: () => "inert-token" }))
      .rejects.toMatchObject({ safeCode: "VERCEL_HTTP_400", diagnostic: { code: null, message: "UNAVAILABLE_OR_MALFORMED_ERROR_BODY" } });
  });

  it("preserves a documented invalid-query 400 as sanitized evidence without adding query parameters", async () => {
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) =>
      new Response(JSON.stringify({ error: { code: "bad_request", message: "Invalid query parameter slug" } }), { status: 400 }));
    await expect(mutateVercel({ generate: { secret: syntheticSecret, note: "fixture" } }, { request, token: () => "inert-token" }))
      .rejects.toMatchObject({ diagnostic: { code: "bad_request", message: "Invalid query parameter slug" } });
    expect(new URL(String(request.mock.calls[0][0])).search).toBe("");
  });

  it("redacts nested secret-bearing errors and never serializes transport error details", async () => {
    const nested = Error(`${syntheticSecret} in response`);
    Object.assign(nested, { cause: { token: syntheticSecret } });
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit): Promise<Response> => { throw nested; });
    await expect(mutateVercel({ revoke: { secret: syntheticSecret, regenerate: false } }, { request, token: () => "inert-token" }))
      .rejects.toThrow("VERCEL_REQUEST_UNAVAILABLE");
    const rejected = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response(syntheticSecret, { status: 403 }));
    await expect(mutateVercel({ revoke: { secret: syntheticSecret, regenerate: false } }, { request: rejected, token: () => "inert-token" }))
      .rejects.toThrow("VERCEL_HTTP_403");
    expect(redactDiagnostic({ details: [{ arbitrary: `prefix ${syntheticSecret} suffix` }], cause: { cookie: syntheticSecret } }, syntheticSecret))
      .toEqual({ details: [{ arbitrary: "prefix [REDACTED] suffix" }], cause: { cookie: "[REDACTED]" } });
    expect(JSON.stringify(redactDiagnostic({ nested: { [syntheticSecret]: "value" } }, syntheticSecret))).not.toContain(syntheticSecret);
  });

  it("retains a validated public request ID without allowing the credential as an ID", () => {
    const diagnostic = { httpStatus: 400, code: "bad_request", message: "invalid field", requestId: "R".repeat(48), at: "2026-10-14T00:00:00.000Z", requestFields: [] };
    expect(safeDiagnostic({ safeCode: "VERCEL_HTTP_400", diagnostic }, syntheticSecret)?.requestId).toBe("R".repeat(48));
    expect(safeDiagnostic({ safeCode: "VERCEL_HTTP_400", diagnostic: { ...diagnostic, requestId: syntheticSecret } }, syntheticSecret)?.requestId).toBeNull();
  });
});
