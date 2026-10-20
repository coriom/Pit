import { createServer, type Server } from "node:http";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_PAGES, validateLocalHost } from "../../scripts/release/local-toolbox-host.mjs";

let server: Server;
let origin: string;
let allowed: Set<string>;
let headers: Record<string, string>;

test.beforeAll(async () => {
  const result = await validateLocalHost();
  allowed = new Set(result.files);
  headers = Object.fromEntries(result.config.headers[0].headers.map(({ key, value }: { key: string; value: string }) => [key, value]));
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const file = pathname.endsWith("/") ? `${pathname.slice(1)}index.html` : pathname.slice(1);
    for (const [key, value] of Object.entries(headers)) response.setHeader(key, value);
    if (!allowed.has(file)) { response.writeHead(404); response.end("Not Found"); return; }
    response.setHeader("Content-Type", file.endsWith(".css") ? "text/css" : file.endsWith(".html") ? "text/html" : "text/plain");
    response.writeHead(200);
    response.end(await readFile(join("dist-local-toolbox-host/public", file)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("Expected local TCP listener");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function guard(page: Page) {
  const unexpected: string[] = [], runtime: string[] = [];
  page.on("pageerror", (error) => runtime.push(error.message));
  await page.route(/^https?:\/\//, (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && allowed.has(url.pathname.endsWith("/") ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1)))
      return route.continue();
    if (url.origin === origin && ["/tools/swap/", "/tools/perps/", "/tools/wallet/", "/tools/taxlot-export/", "/tools/token-approvals/"].includes(url.pathname))
      return route.continue();
    unexpected.push(`${route.request().method()} ${url.origin}${url.pathname}`);
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__localForbidden = [];
    (window as any).ethereum = { request: async ({ method }: { method: string }) => {
      (window as any).__localForbidden.push(`wallet:${method}`);
      throw Error("Wallet forbidden");
    } };
    indexedDB.open = ((..._args: unknown[]) => {
      (window as any).__localForbidden.push("indexedDB.open");
      throw Error("IndexedDB forbidden");
    }) as typeof indexedDB.open;
    for (const method of ["getItem", "setItem", "removeItem", "clear"] as const) {
      (Storage.prototype[method] as any) = function () {
        (window as any).__localForbidden.push(`storage:${method}`);
        throw Error("Storage forbidden");
      };
    }
  });
  return { unexpected, runtime };
}

async function assertNoSideEffects(page: Page, report: Awaited<ReturnType<typeof guard>>) {
  expect(report.unexpected).toEqual([]);
  expect(report.runtime).toEqual([]);
  expect(await page.evaluate(() => (window as any).__localForbidden)).toEqual([]);
}

test("all 22 emitted pages load under strict headers; excluded routes stay absent", async ({ page, browserName }) => {
  test.setTimeout(180_000);
  const report = await guard(page);
  for (const file of LOCAL_PAGES) {
    const route = file === "index.html" ? "/" : `/${file.slice(0, -"index.html".length)}`;
    const response = await page.goto(`${origin}${route}`);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    expect(response?.headers()["content-security-policy"], route).toContain("connect-src 'none'");
    expect(response?.headers()["content-security-policy"], route).toContain("frame-ancestors 'none'");
    expect(response?.headers()["strict-transport-security"], route).toBe("max-age=86400");
    expect(response?.headers()["x-robots-tag"], route).toBe("noindex, nofollow");
    expect(await page.locator("script[src]").count(), route).toBe(0);
    expect(await page.evaluate(() => (window as any).__localForbidden), route).toEqual([]);
  }
  for (const route of ["/tools/swap/", "/tools/perps/", "/tools/wallet/", "/tools/taxlot-export/", "/tools/token-approvals/"])
    expect((await page.goto(`${origin}${route}`))?.status(), route).toBe(404);
  await page.goto(origin);
  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.__arInjected = true";
    document.body.append(script);
  });
  expect(await page.evaluate(() => (window as any).__arInjected)).toBeUndefined();
  await assertNoSideEffects(page, report);
  console.log(`AR_LOCAL_ARTIFACT ${browserName}: 22 pages, 5 excluded routes, CSP and privacy PASS`);
});

test("search and task filters keep the twenty tools reachable by keyboard on mobile", async ({ page }) => {
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/`);
  await page.getByRole("link", { name: "Explore all 20 tools" }).click();
  await expect(page.getByRole("heading", { name: "Choose a task." })).toBeVisible();
  await expect(page.locator("[data-tool]:visible")).toHaveCount(20);
  await page.getByLabel("Search tools by name or purpose").fill("vesting");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(1);
  await expect(page.locator("#tool-match-count")).toHaveText("1 tool shown");
  await page.getByLabel("Search tools by name or purpose").fill("");
  await page.getByRole("button", { name: "Data inspection" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Data inspection" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: /EVM Data Inspector/ }).click();
  await expect(page.getByRole("heading", { name: "EVM Data Inspector" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await assertNoSideEffects(page, report);
});

test("flagship models, incomplete coverage and local portfolio JSON work", async ({ page }) => {
  const report = await guard(page);
  await page.goto(`${origin}/tools/impermanent-loss/`);
  await page.getByRole("button", { name: /Try illustrative example/ }).click();
  await expect(page.getByRole("status").last()).toContainText("Impermanent loss: -20%");
  await page.goto(`${origin}/tools/swap-cost/`);
  await page.getByRole("button", { name: "Load illustrative CoW and Uniswap example" }).click();
  await page.getByRole("button", { name: "Calculate local cost comparison" }).click();
  await expect(page.getByTestId("swap-cost-report")).toBeVisible();
  await page.goto(`${origin}/tools/portfolio-exposure/`);
  await page.getByRole("button", { name: "Load illustrative three-position sample" }).click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  await expect(page.locator("[data-known-total]")).toHaveText("$3000");
  const csv = "accountLabel,chainId,assetType,tokenAddress,symbol,decimals,quantity,unitPriceUsd,priceObservedAt,exposureGroup\nExample,1,native,,ETH,18,1,,,ETH exposure\n";
  await page.getByLabel("Choose local portfolio CSV").setInputFiles({ name: "fictional.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.locator("[data-import-status]")).toContainText("1 rows previewed");
  await page.getByRole("button", { name: "Accept valid preview" }).click();
  await page.getByRole("button", { name: "Analyze current positions" }).click();
  await expect(page.locator("[data-report]")).toContainText("INCOMPLETE");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download local JSON report" }).click()]);
  const exported = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(exported.positions).toHaveLength(4);
  await assertNoSideEffects(page, report);
});

test("new local data tools calculate and export without requests", async ({ page }) => {
  const report = await guard(page);
  await page.goto(`${origin}/tools/evm-data-inspector/`);
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-primary]")).toContainText("0x52908400098527886E0F7030069857D2E4169EE7");
  await page.goto(`${origin}/tools/crypto-data-workshop/`);
  await page.getByRole("button", { name: "Load fictional CSV example" }).click();
  await page.getByRole("button", { name: "Run local review" }).click();
  await expect(page.locator("[data-summary]")).toContainText("3 data rows · 6 columns");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download exact local JSON report" }).click()]);
  const exported = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(exported).toHaveProperty("result");
  await assertNoSideEffects(page, report);
});

test("package guard rejects an unreviewed execution route and altered host policy", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "pit-ar-guard-"));
  try {
    await cp("dist-local-toolbox-host", scratch, { recursive: true });
    await mkdir(join(scratch, "public/tools/swap"), { recursive: true });
    await writeFile(join(scratch, "public/tools/swap/index.html"), "unauthorized");
    await expect(validateLocalHost("dist-local-toolbox", scratch)).rejects.toThrow("unreviewed file");
    await rm(join(scratch, "public/tools/swap"), { recursive: true });
    const configPath = join(scratch, "vercel.json");
    const config = JSON.parse(await readFile(configPath, "utf8"));
    config.headers[0].headers.find((entry: { key: string }) => entry.key === "Content-Security-Policy").value += " 'unsafe-inline'";
    await writeFile(configPath, JSON.stringify(config));
    await expect(validateLocalHost("dist-local-toolbox", scratch)).rejects.toThrow("Vercel configuration");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
