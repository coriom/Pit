import { createServer, type Server } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import { CLOUDFLARE_ROOT, validateCloudflarePackage } from "../../scripts/release/local-toolbox-cloudflare.mjs";
import { LOCAL_PAGES } from "../../scripts/release/local-toolbox-host.mjs";

let server: Server;
let origin: string;
let allowed: Set<string>;
let headers: Record<string, string>;

test.beforeAll(async () => {
  const packageResult = await validateCloudflarePackage();
  allowed = new Set(packageResult.files);
  headers = Object.fromEntries(packageResult.headers.trimEnd().split("\n").slice(1).map((line) => {
    const separator = line.indexOf(": ");
    return [line.slice(2, separator), line.slice(separator + 2)];
  }));
  server = createServer(async (request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const file = path.endsWith("/") ? `${path.slice(1)}index.html` : path.slice(1);
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    if (!allowed.has(file) || file === "_headers" || file === "404.html") {
      response.writeHead(404, { "Content-Type": "text/html" });
      response.end(await readFile(join(CLOUDFLARE_ROOT, "404.html")));
      return;
    }
    response.writeHead(200, { "Content-Type": file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : "text/plain" });
    response.end(await readFile(join(CLOUDFLARE_ROOT, file)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Expected local TCP listener");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

test("Cloudflare package serves exactly the reviewed routes with strict response headers", async ({ page }) => {
  test.setTimeout(180_000);
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith(origin)) external.push(request.url());
  });
  for (const file of LOCAL_PAGES) {
    const path = file === "index.html" ? "/" : `/${file.slice(0, -"index.html".length)}`;
    const response = await page.goto(`${origin}${path}`);
    expect(response?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    const actual = response?.headers() ?? {};
    expect(actual["content-security-policy"], path).toContain("connect-src 'none'");
    expect(actual["content-security-policy"], path).toContain("frame-ancestors 'none'");
    expect(actual["content-security-policy"], path).toContain("form-action 'none'");
    expect(actual["x-robots-tag"], path).toBe("noindex, nofollow");
  }
  for (const path of ["/tools/swap/", "/tools/perps/", "/tools/wallet/", "/tools/taxlot-export/", "/tools/token-approvals/", "/unknown/"])
    expect((await page.goto(`${origin}${path}`))?.status(), path).toBe(404);
  expect(external).toEqual([]);
});

test("Cloudflare package calculates and downloads locally without API or wallet requests", async ({ page }) => {
  const unexpected: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== origin || url.pathname.startsWith("/api/") || /rpc|wallet|telemetry|analytics/i.test(url.pathname))
      unexpected.push(request.url());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/tools/impermanent-loss/`);
  await page.getByRole("button", { name: /Try illustrative example/ }).click();
  await expect(page.getByRole("status").last()).toContainText("Impermanent loss: -20%");
  await page.goto(`${origin}/tools/portfolio-exposure/`);
  await page.getByRole("button", { name: "Load illustrative three-position sample" }).click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  await expect(page.locator("[data-known-total]")).toHaveText("$3000");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download local JSON report" }).click()]);
  const report = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(report.positions).toHaveLength(3);
  expect(unexpected).toEqual([]);
});

test("Cloudflare guard rejects a function file or weakened noindex response", async () => {
  const temp = await mkdtemp(join(tmpdir(), "pit-cf-negative-"));
  try {
    await cp(CLOUDFLARE_ROOT, temp, { recursive: true });
    await writeFile(join(temp, "_worker.js"), "export default {};");
    await expect(validateCloudflarePackage({ root: temp })).rejects.toThrow("allowlist");
    await rm(join(temp, "_worker.js"));
    const original = await readFile(join(temp, "_headers"), "utf8");
    await writeFile(join(temp, "_headers"), original.replace("X-Robots-Tag: noindex, nofollow", "X-Robots-Tag: index, follow"));
    await expect(validateCloudflarePackage({ root: temp })).rejects.toThrow("headers differ");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
