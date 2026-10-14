import { describe, expect, it, vi } from "vitest";
import { confirmRevocation, runLifecycle, safeFailure } from "../scripts/audit/staging-lifecycle.mjs";

const secret = "inert-synthetic-credential-never-sent";
function mockOps() {
  return {
    now: () => "2026-10-13T00:00:00.000Z",
    preflight: vi.fn(async () => undefined),
    retainSecret: vi.fn(async () => secret),
    createRemote: vi.fn(async () => undefined),
    checkAccess: vi.fn(async () => ({ status: 200, csp: true })),
    runBrowser: vi.fn(async () => undefined),
    revokeRemote: vi.fn(async () => undefined),
    verifyRevocation: vi.fn(async () => "REVOCATION_CONFIRMED"),
    deleteSecret: vi.fn(async () => undefined),
  };
}

describe("isolated staging credential lifecycle", () => {
  it("passes only after PIT HTTP 200, browser acceptance, and confirmed revocation", async () => {
    const ops = mockOps();
    const result = await runLifecycle(ops);
    expect(result.status).toBe("PASS");
    expect(result.creationResponse).toBe("HTTP_SUCCESS");
    expect(result.revocation).toBe("REVOCATION_CONFIRMED");
    expect(ops.runBrowser).toHaveBeenCalledOnce();
    expect(ops.deleteSecret).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("stops before secret creation when preflight fails", async () => {
    const ops = mockOps();
    ops.preflight.mockRejectedValueOnce(Error("synthetic nested secret"));
    const result = await runLifecycle(ops);
    expect(result.status).toBe("STAGING_ACCEPTANCE_BLOCKED");
    expect(result.creationResponse).toBe("NOT_SENT");
    expect(ops.retainSecret).not.toHaveBeenCalled();
    expect(ops.createRemote).not.toHaveBeenCalled();
    expect(ops.revokeRemote).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("nested secret");
  });

  it("does not create remotely if local retention fails", async () => {
    const ops = mockOps();
    ops.retainSecret.mockRejectedValueOnce(Error("synthetic filesystem error"));
    const result = await runLifecycle(ops);
    expect(result.status).toBe("CREDENTIAL_CREATION_FAILED");
    expect(ops.createRemote).not.toHaveBeenCalled();
    expect(ops.revokeRemote).not.toHaveBeenCalled();
  });

  it("preserves creation failure but verifies remote absence and deletes retained material", async () => {
    const ops = mockOps();
    ops.createRemote.mockRejectedValueOnce(Object.assign(Error("synthetic secret in response"), { safeCode: "VERCEL_HTTP_400" }));
    const result = await runLifecycle(ops);
    expect(result.status).toBe("CREDENTIAL_CREATION_FAILED");
    expect(result.timeline.some((event) => event.reason === "VERCEL_HTTP_400")).toBe(true);
    expect(ops.runBrowser).not.toHaveBeenCalled();
    expect(ops.revokeRemote).toHaveBeenCalledOnce();
    expect(ops.deleteSecret).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain("synthetic secret");
  });

  it("refuses a login redirect even if the browser would otherwise pass", async () => {
    const ops = mockOps();
    ops.checkAccess.mockResolvedValueOnce({ status: 302, csp: false });
    const result = await runLifecycle(ops);
    expect(result.status).toBe("ACCESS_NOT_ESTABLISHED");
    expect(ops.runBrowser).not.toHaveBeenCalled();
    expect(ops.revokeRemote).toHaveBeenCalledOnce();
  });

  it("refuses HTTP 200 without the PIT CSP", async () => {
    const ops = mockOps();
    ops.checkAccess.mockResolvedValueOnce({ status: 200, csp: false });
    const result = await runLifecycle(ops);
    expect(result.status).toBe("ACCESS_NOT_ESTABLISHED");
    expect(ops.runBrowser).not.toHaveBeenCalled();
  });

  it("keeps browser failure distinct from confirmed revocation", async () => {
    const ops = mockOps();
    ops.runBrowser.mockRejectedValueOnce(Error(`nested ${secret}`));
    const result = await runLifecycle(ops);
    expect(result.status).toBe("STAGING_ACCEPTANCE_BLOCKED");
    expect(result.revocation).toBe("REVOCATION_CONFIRMED");
    expect(ops.deleteSecret).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("records a failed revoke request without claiming an active bypass when reads prove absence", async () => {
    const ops = mockOps();
    ops.revokeRemote.mockRejectedValueOnce(Error("synthetic rejected API request"));
    const result = await runLifecycle(ops);
    expect(result.revokeRequest).toBe("REVOCATION_REQUEST_FAILED");
    expect(result.revocation).toBe("REVOCATION_CONFIRMED");
    expect(result.status).toBe("REVOCATION_REQUEST_FAILED");
    expect(ops.deleteSecret).toHaveBeenCalledOnce();
  });

  it("reports unknown security state and retains the local secret when confirmation times out", async () => {
    const ops = mockOps();
    ops.verifyRevocation.mockResolvedValueOnce("SECURITY_STATUS_UNKNOWN");
    const result = await runLifecycle(ops);
    expect(result.status).toBe("SECURITY_STATUS_UNKNOWN");
    expect(ops.deleteSecret).not.toHaveBeenCalled();
    expect(ops.createRemote).toHaveBeenCalledOnce();
  });

  it("reports an accepted credential only from positive active evidence", async () => {
    const ops = mockOps();
    ops.verifyRevocation.mockResolvedValueOnce("CREDENTIAL_STILL_ACCEPTED");
    const result = await runLifecycle(ops);
    expect(result.status).toBe("CREDENTIAL_STILL_ACCEPTED");
    expect(ops.deleteSecret).not.toHaveBeenCalled();
    expect(ops.createRemote).toHaveBeenCalledOnce();
  });

  it("does not trust an arbitrary safeCode or nested response as a public error", () => {
    const error = Object.assign(Error(`response contains ${secret}`), {
      safeCode: secret.toUpperCase().replaceAll("-", "_"),
      cause: { response: { data: secret } },
    });
    expect(safeFailure(error)).toBe("UNCLASSIFIED_ERROR");
  });
});

describe("read-only revocation confirmation", () => {
  function reads(states: Array<{ entries: number; old: number; anonymous: number }>) {
    let index = 0;
    const observations: string[] = [];
    const ops = {
      projectState: async () => ({ protectionBypass: Object.fromEntries(Array.from({ length: states[index].entries }, (_, n) => [n, {}])) }),
      protectedRead: async (value?: string) => ({ status: value ? states[index].old : states[index].anonymous }),
      sleep: async () => { index++; },
    };
    return { ops, observations };
  }

  it("accepts delayed propagation only after the old secret is rejected", async () => {
    const { ops, observations } = reads([
      { entries: 1, old: 200, anonymous: 302 },
      { entries: 0, old: 302, anonymous: 302 },
    ]);
    expect(await confirmRevocation(secret, ops, (state) => observations.push(state))).toBe("REVOCATION_CONFIRMED");
    expect(observations).toEqual(["REVOCATION_PENDING_CONFIRMATION", "REVOCATION_CONFIRMED"]);
  });

  it("classifies an old credential still accepted after the bound as active", async () => {
    const { ops } = reads(Array(4).fill({ entries: 1, old: 200, anonymous: 302 }));
    expect(await confirmRevocation(secret, ops)).toBe("CREDENTIAL_STILL_ACCEPTED");
  });

  it("does not call a 302 redirect accepted, even after a failed revoke request", async () => {
    const { ops } = reads([{ entries: 0, old: 302, anonymous: 302 }]);
    expect(await confirmRevocation(secret, ops)).toBe("REVOCATION_CONFIRMED");
  });

  it("reports unknown when project state or protected reads are unavailable", async () => {
    const ops = {
      projectState: async () => { throw Error(`nested ${secret}`); },
      protectedRead: async () => ({ status: 302 }),
      sleep: async () => undefined,
    };
    expect(await confirmRevocation(secret, ops)).toBe("SECURITY_STATUS_UNKNOWN");
  });
});
