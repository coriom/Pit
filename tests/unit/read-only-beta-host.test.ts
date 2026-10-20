import { afterEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BETA_PAGES } from "../../scripts/release/read-only-beta.mjs";
import {
  BETA_HSTS,
  prepareAndValidateHostPackage,
  validateBetaCsp,
  validateHostPackage,
} from "../../scripts/release/read-only-beta-host.mjs";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pit-beta-host-"));
  roots.push(root);
  const candidate = join(root, "candidate");
  const host = join(root, "host");
  const script = "document.body.dataset.calculated = 'yes';";
  const hash = createHash("sha256").update(script).digest("base64");
  const csp = `connect-src 'none';default-src 'none';script-src 'self' 'sha256-${hash}';style-src 'self'`;
  const html = `<html><head><meta http-equiv="content-security-policy" content="${csp}"></head><body><script>${script}</script></body></html>`;
  for (const file of BETA_PAGES) {
    await mkdir(dirname(join(candidate, file)), { recursive: true });
    await writeFile(join(candidate, file), html);
  }
  await mkdir(join(candidate, "_astro"));
  await writeFile(join(candidate, "_astro", "local.css"), "body{color:white}");
  await writeFile(
    join(candidate, "robots.txt"),
    "User-agent: *\nDisallow: /\n",
  );
  return { candidate, host, html, csp };
}

describe("read-only Vercel host package", () => {
  it("packages only reviewed static pages, CSS and robots with config outside public", async () => {
    const { candidate, host } = await fixture();
    const result = await prepareAndValidateHostPackage(candidate, host);
    expect(result).toMatchObject({ pages: 8, cssAssets: 1 });
    expect(result.publicFiles).toHaveLength(10);
    expect(result.hostFiles).toHaveLength(11);
    expect(result.hostFiles).not.toContain("public/_headers");
    expect(result.hostFiles).not.toContain("public/vercel.json");
    const config = JSON.parse(
      await readFile(join(host, "vercel.json"), "utf8"),
    );
    expect(Object.keys(config).sort()).toEqual([
      "$schema",
      "framework",
      "headers",
      "outputDirectory",
    ]);
    expect(config.framework).toBeNull();
    expect(config.outputDirectory).toBe("public");
    expect(config.headers).toHaveLength(1);
    expect(config.headers[0].source).toBe("/(.*)");
    const headers = Object.fromEntries(
      config.headers[0].headers.map(
        ({ key, value }: { key: string; value: string }) => [key, value],
      ),
    );
    expect(headers["Content-Security-Policy"]).toBe(
      `${result.config.headers[0].headers[0].value}`,
    );
    expect(headers["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
    expect(headers["Content-Security-Policy"]).toContain("connect-src 'none'");
    expect(headers["Strict-Transport-Security"]).toBe(BETA_HSTS);
    expect(headers["Strict-Transport-Security"]).not.toMatch(
      /includeSubDomains|preload/,
    );
    expect(headers["X-Robots-Tag"]).toBe("noindex");
    expect(await validateHostPackage(candidate, host)).toMatchObject({
      candidateSha256: result.candidateSha256,
      hostSha256: result.hostSha256,
    });
  });

  it("rejects unreviewed route or function before packaging", async () => {
    const { candidate, host } = await fixture();
    await mkdir(join(candidate, "api"));
    await writeFile(
      join(candidate, "api", "handler.js"),
      "export default () => 1",
    );
    await expect(
      prepareAndValidateHostPackage(candidate, host),
    ).rejects.toThrow("routes or files");
  });

  it("rejects added public execution asset and modified Vercel rewrite", async () => {
    const { candidate, host } = await fixture();
    await prepareAndValidateHostPackage(candidate, host);
    await writeFile(join(host, "public", "wallet.js"), "eth_sendTransaction()");
    await expect(validateHostPackage(candidate, host)).rejects.toThrow(
      "unreviewed file",
    );
    await rm(join(host, "public", "wallet.js"));
    const path = join(host, "vercel.json");
    const config = JSON.parse(await readFile(path, "utf8"));
    config.rewrites = [{ source: "/tools/swap/", destination: "/" }];
    await writeFile(path, JSON.stringify(config));
    await expect(validateHostPackage(candidate, host)).rejects.toThrow(
      "configuration changed",
    );
  });

  it("rejects a host copy that differs from the reviewed candidate", async () => {
    const { candidate, host } = await fixture();
    await prepareAndValidateHostPackage(candidate, host);
    await writeFile(
      join(host, "public", "tools", "pnl", "index.html"),
      "modified",
    );
    await expect(validateHostPackage(candidate, host)).rejects.toThrow(
      "copy differs",
    );
  });

  it("requires hashes for every actual inline script and rejects extra header policy changes", async () => {
    const { html, csp } = await fixture();
    expect(
      validateBetaCsp([["index.html", html]], `${csp}; frame-ancestors 'none'`),
    ).toHaveLength(1);
    expect(() =>
      validateBetaCsp(
        [["index.html", html]],
        "connect-src 'none';default-src 'none';script-src 'self';style-src 'self'; frame-ancestors 'none'",
      ),
    ).toThrow();
    expect(() =>
      validateBetaCsp([["index.html", html]], `${csp}; frame-ancestors 'self'`),
    ).toThrow();
    const extra = csp.replace(
      ";style-src",
      " 'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';style-src",
    );
    expect(() =>
      validateBetaCsp(
        [["index.html", html.replace(csp, extra)]],
        `${extra}; frame-ancestors 'none'`,
      ),
    ).toThrow("unreviewed surplus");
  });
});
