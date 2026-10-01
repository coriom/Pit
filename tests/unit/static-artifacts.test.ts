import { describe, expect, it } from "vitest";
import {
  validateArtifacts,
  validateAnalyticsDependencies,
} from "../../scripts/release/artifacts.mjs";

const policy =
  "default-src 'none'; script-src 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.cow.fi https://api.hyperliquid-testnet.xyz https://rpc.hyperliquid-testnet.xyz https://ethereum-sepolia-rpc.publicnode.com https://11155111.rpc.thirdweb.com; img-src 'self' data:; font-src 'self' data:";
function fixture() {
  const html = `<html><head><meta http-equiv="content-security-policy" content="${policy}"><link rel="stylesheet" href="./_astro/app.css"></head><body><script src="./_astro/app.js"></script></body></html>`;
  return new Map([
    ["index.html", html],
    ["tools/index.html", html],
    ["fees/index.html", html],
    ["legal/index.html", html],
    [
      "_headers",
      `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: ${policy}; frame-ancestors 'none'\n`,
    ],
    ["_astro/app.css", "body{color:black}"],
    ["_astro/app.js", "console.log('pit')"],
  ]);
}
function mutateAllHtml(
  files: Map<string, string>,
  fn: (html: string) => string,
) {
  for (const key of [
    "index.html",
    "tools/index.html",
    "fees/index.html",
    "legal/index.html",
  ])
    files.set(key, fn(files.get(key)!));
}
function mutatePolicy(
  files: Map<string, string>,
  fn: (value: string) => string,
) {
  const replacement = fn(policy);
  mutateAllHtml(files, (html) => html.replace(policy, replacement));
  files.set("_headers", files.get("_headers")!.replace(policy, replacement));
}
describe("release static artifact gate", () => {
  it("accepts self-hosted scripts/styles with strict CSP", () => {
    expect(validateArtifacts(fixture()).externalExecutable).toBe(0);
  });
  it("rejects a missing toolbox landing page", () => {
    const files = fixture();
    files.delete("tools/index.html");
    expect(() => validateArtifacts(files)).toThrow("Missing required static page");
  });
  it.each([
    [
      "remote script without SRI",
      (f: Map<string, string>) =>
        mutateAllHtml(f, (h) =>
          h.replace(
            "</body>",
            '<script src="https://cdn.example/app.js"></script></body>',
          ),
        ),
    ],
    [
      "unquoted remote script",
      (f: Map<string, string>) =>
        mutateAllHtml(f, (h) =>
          h.replace(
            "</body>",
            "<script src=https://cdn.example/app.js></script></body>",
          ),
        ),
    ],
    [
      "protocol-relative remote script",
      (f: Map<string, string>) =>
        mutateAllHtml(f, (h) =>
          h.replace(
            "</body>",
            '<script src="//cdn.example/app.js"></script></body>',
          ),
        ),
    ],
    [
      "remote stylesheet without SRI",
      (f: Map<string, string>) =>
        mutateAllHtml(f, (h) =>
          h.replace(
            "</head>",
            '<link rel="stylesheet" href="https://cdn.example/app.css"></head>',
          ),
        ),
    ],
    [
      "remote script with SRI but no CORS",
      (f: Map<string, string>) =>
        mutateAllHtml(f, (h) =>
          h.replace(
            "</body>",
            '<script src="https://cdn.example/app.js" integrity="sha384-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"></script></body>',
          ),
        ),
    ],
    [
      "unsafe eval",
      (f: Map<string, string>) =>
        mutatePolicy(f, (p) =>
          p.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"),
        ),
    ],
    [
      "wildcard CSP",
      (f: Map<string, string>) =>
        mutatePolicy(f, (p) =>
          p.replace("connect-src 'self'", "connect-src * 'self'"),
        ),
    ],
    [
      "mainnet CSP host",
      (f: Map<string, string>) =>
        mutatePolicy(f, (p) =>
          p.replace("https://api.cow.fi", "https://api.hyperliquid.xyz"),
        ),
    ],
    [
      "analytics endpoint",
      (f: Map<string, string>) =>
        f.set(
          "_astro/app.js",
          'fetch("https://www.google-analytics.com/collect")',
        ),
    ],
    [
      "secret-like value",
      (f: Map<string, string>) =>
        f.set("_astro/app.js", "API_" + 'KEY="abcdefghijklmnopqrstuvwx"'),
    ],
    [
      "source map",
      (f: Map<string, string>) => f.set("_astro/app.js.map", "{}"),
    ],
    [
      "mainnet execution endpoint",
      (f: Map<string, string>) =>
        f.set("_astro/app.js", 'fetch("https://api.hyperliquid.xyz/exchange")'),
    ],
    [
      "external CSS import",
      (f: Map<string, string>) =>
        f.set("_astro/app.css", '@import "https://fonts.example/font.css";'),
    ],
    [
      "external CSS font or image",
      (f: Map<string, string>) =>
        f.set("_astro/app.css", "background:url(https://cdn.example/icon.png)"),
    ],
  ])("rejects %s", (_label, mutation) => {
    const files = fixture();
    mutation(files);
    expect(() => validateArtifacts(files)).toThrow();
  });
});

describe("analytics dependency gate", () => {
  it("accepts PIT's package and source fixture", () => {
    expect(() =>
      validateAnalyticsDependencies(
        new Map([
          ["package.json", '{"dependencies":{"connectkit":"1.9.2"}}'],
          ["src/app.ts", 'import { injected } from "wagmi/connectors"'],
        ]),
      ),
    ).not.toThrow();
  });
  it("rejects a direct analytics package", () => {
    expect(() =>
      validateAnalyticsDependencies(
        new Map([["package.json", '{"dependencies":{"posthog-js":"1.0.0"}}']]),
      ),
    ).toThrow(/Direct analytics/);
  });
  it("rejects an app-source telemetry import", () => {
    expect(() =>
      validateAnalyticsDependencies(
        new Map([
          ["package.json", "{}"],
          ["src/app.ts", 'import analytics from "@metamask/sdk-analytics"'],
        ]),
      ),
    ).toThrow(/Analytics import/);
  });
});
