import { describe, expect, it, vi } from "vitest";
import { mutateVercel } from "../scripts/audit/staging-access.mjs";
import { protectedRead, scopedBypassHeaders, STAGING_ORIGIN } from "../scripts/audit/staging-readonly.mjs";

describe("test-only protected staging header scope", () => {
  const synthetic = "synthetic-test-only";

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
      await mutateVercel({ generate: { secret: "synthetic-only", note: "fixture" } }, { request, token: () => "inert-token" });
      expect(request).toHaveBeenCalledOnce();
      const [url, options] = request.mock.calls[0];
      expect(url).toBe("https://api.vercel.com/v1/projects/prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE/protection-bypass");
      expect(url).not.toContain("synthetic-only");
      expect(options?.method).toBe("PATCH");
      expect(options?.redirect).toBe("manual");
      expect(JSON.parse(String(options?.body))).toEqual({ generate: { secret: "synthetic-only", note: "fixture" } });
      expect(log).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  it("redacts a nested API error and emits only an HTTP status code", async () => {
    const nested = Error("synthetic-only in response");
    Object.assign(nested, { cause: { token: "synthetic-only" } });
    const request = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit): Promise<Response> => { throw nested; });
    await expect(mutateVercel({ revoke: { secret: "synthetic-only", regenerate: false } }, { request, token: () => "inert-token" }))
      .rejects.toThrow("VERCEL_REQUEST_UNAVAILABLE");
    const rejected = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => new Response("synthetic-only in response", { status: 403 }));
    await expect(mutateVercel({ revoke: { secret: "synthetic-only", regenerate: false } }, { request: rejected, token: () => "inert-token" }))
      .rejects.toThrow("VERCEL_HTTP_403");
  });
});
