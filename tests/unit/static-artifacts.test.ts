import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  artifactSecretKind,
  validateArtifacts,
  validateAnalyticsDependencies,
  validateProjectVercelConfig,
} from "../../scripts/release/artifacts.mjs";

const policy =
  "default-src 'none'; script-src 'self' 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.cow.fi https://api.hyperliquid-testnet.xyz https://rpc.hyperliquid-testnet.xyz https://ethereum-sepolia-rpc.publicnode.com https://11155111.rpc.thirdweb.com; img-src 'self' data:; font-src 'self' data:";
function fixture() {
  const html = `<html><head><meta http-equiv="content-security-policy" content="${policy}"><link rel="stylesheet" href="./_astro/app.css"></head><body><script src="./_astro/app.js"></script></body></html>`;
  const securityHeaders = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Content-Security-Policy", value: `${policy}; frame-ancestors 'none'` },
  ];
  return new Map([
    ["index.html", html],
    ["tools/index.html", html],
    ["fees/index.html", html],
    ["legal/index.html", html],
    [
      "_headers",
      `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: ${policy}; frame-ancestors 'none'\n`,
    ],
    ["vercel.json", JSON.stringify({
      $schema: "https://openapi.vercel.sh/vercel.json",
      framework: null,
      outputDirectory: ".",
      headers: [{ source: "/(.*)", headers: securityHeaders }],
    })],
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
  it("accepts only the matching project-root Vercel CSP and dist output", () => {
    const artifact = fixture().get("vercel.json")!;
    const root = JSON.parse(artifact);
    root.outputDirectory = "dist";
    expect(() => validateProjectVercelConfig(JSON.stringify(root), artifact)).not.toThrow();
  });
  it("rejects stale project-root CSP hashes and unrelated routes", () => {
    const artifact = fixture().get("vercel.json")!;
    const root = JSON.parse(artifact);
    root.outputDirectory = "dist";
    root.headers[0].headers[2].value += " 'sha256-FAKE'";
    expect(() => validateProjectVercelConfig(JSON.stringify(root), artifact)).toThrow("Project-root Vercel");
    root.headers = JSON.parse(artifact).headers;
    root.routes = [];
    expect(() => validateProjectVercelConfig(JSON.stringify(root), artifact)).toThrow("Project-root Vercel");
  });
  it("rejects a wrong project-root output directory", () => {
    const artifact = fixture().get("vercel.json")!;
    expect(() => validateProjectVercelConfig(artifact, artifact)).toThrow("Project-root Vercel");
  });
  it.each(["PIT_AUTONOMOUS_SIGNER_TEST_ONLY", "/home/corio/.pit/test-operator/key", "autonomous-signer.mjs"])(
    "rejects test signer leakage in production output: %s",
    (value) => {
      const files = fixture();
      files.set("_astro/app.js", `console.log(${JSON.stringify(value)})`);
      expect(() => validateArtifacts(files)).toThrow("Test signer or secret loader");
    },
  );
  it("rejects the staging accounting harness by path or marker in production output", () => {
    const byPath = fixture();
    byPath.set("__pit-staging-accounting/index.html", "synthetic audit");
    expect(() => validateArtifacts(byPath)).toThrow("Staging accounting harness");
    const byContent = fixture();
    byContent.set("_astro/app.js", "pit:staging-synthetic");
    expect(() => validateArtifacts(byContent)).toThrow("Staging accounting harness");
    for (const value of ["PIT_STAGING_ACCEPTANCE_ONLY", "staging-audit-access", "staging-access.mjs", "staging-diagnostics.mjs", "com.vercel.cli", "x-vercel-protection-bypass"]) {
      const byAutomation = fixture();
      byAutomation.set("_astro/app.js", value);
      expect(() => validateArtifacts(byAutomation)).toThrow("Staging accounting harness");
    }
  });
  it("accepts self-hosted scripts/styles with strict CSP", () => {
    expect(validateArtifacts(fixture()).externalExecutable).toBe(0);
  });
  it("rejects Vercel headers that differ from the built CSP", () => {
    const files = fixture();
    files.set("vercel.json", files.get("vercel.json")!.replace("frame-ancestors 'none'", "frame-ancestors *"));
    expect(() => validateArtifacts(files)).toThrow("Vercel headers differ");
  });
  it("rejects a Vercel function or route added to the static artifact", () => {
    const files = fixture();
    const config = JSON.parse(files.get("vercel.json")!);
    config.functions = { "api/*": {} };
    files.set("vercel.json", JSON.stringify(config));
    expect(() => validateArtifacts(files)).toThrow("Vercel headers differ");
  });
  it("rejects a missing toolbox landing page", () => {
    const files = fixture();
    files.delete("tools/index.html");
    expect(() => validateArtifacts(files)).toThrow(
      "Missing required static page",
    );
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

describe("public documentation URL and credential URL classification", () => {
  const publicUrl =
    "https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments";
  const withScript = (value: string) => {
    const files = fixture();
    files.set("_astro/app.js", value);
    return files;
  };
  it("accepts the original literal URL in source and built-style JavaScript", () => {
    const source = readFileSync("src/lib/quote-markets.ts", "utf8");
    expect(source).toContain(`"${publicUrl}"`);
    expect(artifactSecretKind(`source:"${publicUrl}"`)).toBeNull();
    expect(() =>
      validateArtifacts(withScript(`source:"${publicUrl}"`)),
    ).not.toThrow();
  });
  it("still rejects an independent assignment beside the public URL", () => {
    const neighbor = ["API_", "KEY=", "syntheticvalue123456"].join("");
    expect(artifactSecretKind(`source:"${publicUrl}";${neighbor}`)).toBe(
      "assignment",
    );
    expect(() =>
      validateArtifacts(withScript(`source:"${publicUrl}";${neighbor}`)),
    ).toThrow("Secret-like value");
  });
  it("rejects credential-shaped URL userinfo and sensitive query values", () => {
    const userinfo = `https://id:${"synthetic".repeat(2)}@developers.uniswap.org/docs/protocols/v3/deployments/`;
    const query = `${publicUrl}?${["api", "key"].join("_")}=${"synthetic1"}`;
    expect(artifactSecretKind(userinfo)).toBe("url-userinfo");
    expect(artifactSecretKind(query)).toBe("url-sensitive-query");
    expect(() => validateArtifacts(withScript(userinfo))).toThrow(
      "Secret-like value",
    );
    expect(() => validateArtifacts(withScript(query))).toThrow(
      "Secret-like value",
    );
  });
  it("does not grant trust to a lookalike host or nested public URL", () => {
    const opaque = "Ab9_".repeat(6);
    const lookalike = `https://developers.uniswap.org.evil.invalid/v3/${opaque}`;
    const nested = `https://evil.invalid/redirect?next=${publicUrl}&${["api", "key"].join("_")}=${"synthetic1"}`;
    expect(artifactSecretKind(lookalike)).toBe("url-opaque-version-id");
    expect(artifactSecretKind(nested)).toBe("url-sensitive-query");
    expect(() => validateArtifacts(withScript(lookalike))).toThrow(
      "Secret-like value",
    );
    expect(() => validateArtifacts(withScript(nested))).toThrow(
      "Secret-like value",
    );
  });
  it("rejects a changed opaque value regardless of artifact location", () => {
    const changed = `https://developers.uniswap.org/docs/protocols/v3/${"Ab9_".repeat(6)}`;
    expect(artifactSecretKind(changed)).toBe("url-opaque-version-id");
    for (const path of ["_astro/app.js", "docs/evidence.txt"]) {
      const files = fixture();
      files.set(path, changed);
      expect(() => validateArtifacts(files)).toThrow("Secret-like value");
    }
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
