import { describe, expect, it } from "vitest";
import { cloudflareHeaders } from "../../scripts/release/local-toolbox-cloudflare.mjs";

const policy = "default-src 'none'; connect-src 'none'; form-action 'none'; script-src 'sha256-example'; frame-ancestors 'none'";
const headers = [
  { key: "Content-Security-Policy", value: policy },
  { key: "Strict-Transport-Security", value: "max-age=86400" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

describe("Cloudflare Pages header conversion", () => {
  it("renders one global static-response rule with the full policy", () => {
    const output = cloudflareHeaders(headers);
    expect(output).toBe(`/*\n${headers.map(({ key, value }) => `  ${key}: ${value}`).join("\n")}\n`);
    expect(output).toContain("form-action 'none'");
    expect(output).toContain("X-Robots-Tag: noindex, nofollow");
  });

  it("rejects a CSP longer than Cloudflare's 2,000-character line limit", () => {
    const changed = headers.map((header) => header.key === "Content-Security-Policy"
      ? { ...header, value: `${header.value}; script-src ${"a".repeat(2000)}` } : header);
    expect(() => cloudflareHeaders(changed)).toThrow("exceeds 2000");
  });

  it("rejects duplicate headers, header injection and missing HTTP-only restrictions", () => {
    expect(() => cloudflareHeaders([...headers.slice(0, -1), headers[0]])).toThrow("duplicate");
    expect(() => cloudflareHeaders(headers.map((header) => header.key === "Referrer-Policy"
      ? { ...header, value: "no-referrer\r\nX-Bad: yes" } : header))).toThrow("Malformed");
    expect(() => cloudflareHeaders(headers.map((header) => header.key === "Content-Security-Policy"
      ? { ...header, value: policy.replace("frame-ancestors 'none'", "") } : header))).toThrow("CSP incomplete");
  });
});
