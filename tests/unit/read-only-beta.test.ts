import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { BETA_PAGES, prepareAndValidateBeta } from "../../scripts/release/read-only-beta.mjs";
import { READ_ONLY_TOOLS } from "../../src/lib/read-only-beta";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pit-readonly-beta-")); roots.push(root);
  const script = "document.body.dataset.local = 'true';";
  const hash = createHash("sha256").update(script).digest("base64");
  const csp = `connect-src 'none';default-src 'none';script-src 'self' 'sha256-${hash}';style-src 'self'`;
  const html = `<html><head><meta http-equiv="content-security-policy" content="${csp}"></head><body><script>${script}</script></body></html>`;
  for (const file of BETA_PAGES) { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), html); }
  await mkdir(join(root, "_astro")); await writeFile(join(root, "_astro", "local.css"), "body{color:white}");
  await writeFile(join(root, "robots.txt"), "User-agent: *\nDisallow: /\n");
  return { root, html };
}
describe("read-only beta source and emitted-artifact isolation", () => {
  it("allowlists only six no-wallet, no-network local tools", () => {
    expect(READ_ONLY_TOOLS.map((tool) => tool.id)).toEqual(["portfolio-exposure", "swap-cost", "impermanent-loss", "pnl", "bridge-cost", "liquidation"]);
    expect(READ_ONLY_TOOLS.every((tool) => tool.executionMode === "local" && tool.walletRequirement === "none" && tool.networkRequirement === "none")).toBe(true);
  });
  it("accepts an exact static page set with script hashes and noindex headers", async () => {
    const { root } = await fixture();
    const result = await prepareAndValidateBeta(root);
    expect(result).toMatchObject({ pages: 8, assets: 1, files: 11 });
  });
  it.each([
    ["execution route", '<a href="./tools/swap/">Swap</a>'],
    ["wallet signing", "<script>eth_sendTransaction()</script>"],
    ["RPC request", "<script>fetch('https://rpc.example')</script>"],
    ["accounting storage", "<script>indexedDB.open('pit-taxlot-v1')</script>"],
  ])("rejects %s in emitted HTML", async (_, injection) => {
    const { root, html } = await fixture();
    await writeFile(join(root, "index.html"), html.replace("</body>", `${injection}</body>`));
    await expect(prepareAndValidateBeta(root)).rejects.toThrow();
  });
  it("rejects a wallet or execution chunk even if no page links to it", async () => {
    const { root } = await fixture();
    await writeFile(join(root, "_astro", "execution.js"), "export const sign = true");
    await expect(prepareAndValidateBeta(root)).rejects.toThrow("unexpected executable");
  });
  it("rejects a missing CSP hash and an indexing policy change", async () => {
    const { root, html } = await fixture();
    await writeFile(join(root, "index.html"), html.replace("sha256-", "sha256-BAD"));
    await expect(prepareAndValidateBeta(root)).rejects.toThrow("CSP hash");
    await writeFile(join(root, "index.html"), html);
    await writeFile(join(root, "robots.txt"), "User-agent: *\nAllow: /\n");
    await expect(prepareAndValidateBeta(root)).rejects.toThrow("robots policy");
  });
});
