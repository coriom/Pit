import { createServer, type Server } from "node:http";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, type Page } from "@playwright/test";
import { LOCAL_PAGES, validateLocalHost } from "../../scripts/release/local-toolbox-host.mjs";
import { AVAILABLE_LOCAL_TASKS } from "../../src/lib/local-task-registry";

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

test("BJ derivative and trading task pages calculate locally with safe downloads", async ({ page }) => {
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ["options-strategy", "portfolio-greeks", "volatility-smile", "delta-hedge", "futures-hedge", "funding-history", "trading-journal", "order-book-depth"]) {
    const response = await page.goto(`${origin}/tasks/${id}/`);
    expect(response?.status(), id).toBe(200);
    await page.locator('[data-bb-tool] button.primary[type="submit"]').click();
    await expect(page.locator("[data-bb-output]"), id).toBeVisible();
    await expect(page.locator("[data-bb-error]"), id).toBeHidden();
    if (id === "volatility-smile") await expect(page.locator("[data-bb-plot-wrap]")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), id).toBe(true);
  }
  const download = page.waitForEvent("download");
  await page.locator("[data-bb-download]").click();
  expect((await download).suggestedFilename()).toBe("pit-order-book-depth-illustration.json");
  await page.locator('[data-bb-tool] input[name="quantity"]').fill("1e3");
  await page.locator('[data-bb-tool] button.primary[type="submit"]').click();
  await expect(page.locator("[data-bb-error]")).toBeVisible();
  await assertNoSideEffects(page, report);
});

test("BK portfolio tasks calculate from manual data without side effects", async ({ page }) => {
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of ["monte-carlo-portfolio", "risk-parity-weights", "minimum-variance-weights", "correlation-matrix", "performance-attribution", "underwater-ulcer", "fx-exposure-stress", "inflation-adjusted-return"]) {
    expect((await page.goto(`${origin}/tasks/${id}/`))?.status(), id).toBe(200);
    await page.locator('[data-bc-tool] button.primary[type="submit"]').click();
    await expect(page.locator("[data-bc-output]"), id).toBeVisible();
    await expect(page.locator("[data-bc-error]"), id).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), id).toBe(true);
  }
  const download=page.waitForEvent("download");
  await page.locator("[data-bc-download]").click();
  expect((await download).suggestedFilename()).toBe("pit-inflation-adjusted-return-illustration.json");
  await page.locator('[data-bc-tool] input[name="inflationPct"]').fill("-100");
  await page.locator('[data-bc-tool] button.primary[type="submit"]').click();
  await expect(page.locator("[data-bc-error]")).toBeVisible();
  await assertNoSideEffects(page,report);
});

test("BL DeFi model tasks remain offline and disclose incomplete assumptions", async ({ page }) => {
  const report=await guard(page);
  await page.setViewportSize({width:390,height:844});
  for(const id of ["stableswap-two-coin","weighted-amm-swap","multi-hop-amm","lp-fee-compounding","lending-rate-curve","multi-collateral-stress","vault-fee-impact","insurance-fund-stress"]){
    expect((await page.goto(`${origin}/tasks/${id}/`))?.status(),id).toBe(200);
    await page.locator('[data-bd-tool] button.primary[type="submit"]').click();
    await expect(page.locator("[data-bd-output]"),id).toBeVisible();
    await expect(page.locator("[data-bd-error]"),id).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),id).toBe(true);
  }
  const download=page.waitForEvent("download");await page.locator("[data-bd-download]").click();
  expect((await download).suggestedFilename()).toBe("pit-insurance-fund-stress-illustration.json");
  await page.locator('[data-bd-tool] input[name="fundReserve"]').fill("1e3");
  await page.locator('[data-bd-tool] button.primary[type="submit"]').click();
  await expect(page.locator("[data-bd-error]")).toBeVisible();
  await assertNoSideEffects(page,report);
});

test("all allowlisted emitted pages load under strict headers; excluded routes stay absent", async ({ page, browserName }) => {
  test.setTimeout(180_000);
  const report = await guard(page);
  for (const file of LOCAL_PAGES) {
    const route = file === "index.html" ? "/" : `/${file.slice(0, -"index.html".length)}`;
    const response = await page.goto(`${origin}${route}`);
    expect(response?.status(), route).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
    expect(response?.headers()["content-security-policy"], route).toContain("connect-src 'none'");
    expect(response?.headers()["content-security-policy"], route).toContain("form-action 'none'");
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
  console.log(`AR_LOCAL_ARTIFACT ${browserName}: ${LOCAL_PAGES.length} pages, 5 excluded routes, CSP and privacy PASS`);
});

test("a form cannot leak manually entered values through fallback navigation", async ({ page }) => {
  await page.goto(`${origin}/tools/pnl/`);
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("pit_private_input")) sent.push(request.url());
  });
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.method = "GET";
    form.action = "/?pit_private_input=should-never-leave";
    document.body.append(form);
    form.submit();
  });
  await page.waitForTimeout(100);
  expect(page.url()).toBe(`${origin}/tools/pnl/`);
  expect(sent).toEqual([]);
});

test("private notice pages, metadata and keyboard navigation remain usable on mobile", async ({ page }) => {
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/`);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
  await page.keyboard.press("Enter");
  expect(new URL(page.url()).hash).toBe("#main-content");
  await page.getByRole("link", { name: "Privacy" }).first().click();
  await expect(page.getByRole("heading", { name: "Privacy", exact: true })).toBeVisible();
  await expect(page.locator("article")).toContainText("normal HTTP request metadata");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
  await page.getByRole("link", { name: "Site information" }).first().click();
  await expect(page.getByRole("heading", { name: "Site information and limitations" })).toBeVisible();
  await expect(page.locator("article")).toContainText("Before public release");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await assertNoSideEffects(page, report);
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
  await expect(page.locator("#tool-match-count")).toContainText("entries shown");
  await page.getByLabel("Search tools by name or purpose").fill("");
  await page.getByRole("button", { name: "Data inspection" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("[data-tool]:visible")).toHaveCount(2);
  await expect(page.locator("[data-task]:visible")).not.toHaveCount(0);
  await expect(page.getByRole("button", { name: "Data inspection" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: /EVM Data Inspector/ }).click();
  await expect(page.getByRole("heading", { name: "EVM Data Inspector" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  await assertNoSideEffects(page, report);
});

test("each focused task opens its reviewed mode and calculates without side effects", async ({ page }) => {
  test.setTimeout(180_000);
  const report = await guard(page);
  for (const task of AVAILABLE_LOCAL_TASKS) {
    const response = await page.goto(`${origin}${task.path}`);
    expect(response?.status(), task.id).toBe(200);
    await expect(page.getByRole("heading", { name: task.title, exact: true })).toBeVisible();
    if (task.engineId === "bb-derivatives") {
      await page.locator('[data-task-shell] form button.primary[type="submit"]').click();
      await expect(page.locator('[data-bb-output]'), task.id).toBeVisible();
      expect(await page.evaluate(() => (window as any).__localForbidden), task.id).toEqual([]);
      continue;
    }
    if (task.engineId === "bc-statistics") {
      await page.locator('[data-task-shell] form button.primary[type="submit"]').click();
      await expect(page.locator('[data-bc-output]'), task.id).toBeVisible();
      expect(await page.evaluate(() => (window as any).__localForbidden), task.id).toEqual([]);
      continue;
    }
    if (task.engineId === "bd-defi-evm") {
      await page.locator('[data-task-shell] form button.primary[type="submit"]').click();
      await expect(page.locator('[data-bd-output]'), task.id).toBeVisible();
      expect(await page.evaluate(() => (window as any).__localForbidden), task.id).toEqual([]);
      continue;
    }
    await expect(page.locator('[data-task-shell] select[name="mode"]')).toHaveValue(task.mode);
    const panel = page.locator(`[data-task-shell] [data-mode-panel="${task.mode}"], [data-task-shell] [data-panel="${task.mode}"]`);
    if (await panel.count()) await expect(panel).toBeVisible();
    if (task.id === "tranche-unlocks") await page.getByRole("button", { name: "Load illustrative example" }).click();
    if (task.engineId === "crypto-data-workshop") {
      await page.getByRole("button", { name: "Load fictional CSV example" }).click();
      if (task.mode !== "inspect") {
        await page.locator('[data-task-shell] select[name="mode"]').selectOption("inspect");
        await page.locator('[data-task-shell] form button.primary[type="submit"]').click();
        await expect(page.locator('[data-task-shell] [data-result]')).toBeVisible();
        await page.locator('[data-task-shell] select[name="mode"]').selectOption(task.mode);
        await page.locator('[data-task-shell] input[name="confirm"]').check();
      }
    }
    await page.locator('[data-task-shell] form button.primary[type="submit"]').click();
    await expect(page.locator('[data-task-shell] [data-result], [data-task-shell] [data-report]'), task.id).toBeVisible();
    if (task.focusLabel) {
      await expect(page.locator('[data-task-focused]'), task.id).toBeVisible();
      await expect(page.locator('[data-task-focused-value]'), task.id).not.toContainText('Unavailable under the current assumptions');
    }
    expect(await page.evaluate(() => (window as any).__localForbidden), task.id).toEqual([]);
  }
  await page.goto(`${origin}/tools/`);
  await page.getByRole("button", { name: "Focused tasks" }).click();
  await expect(page.locator("[data-task]:visible")).toHaveCount(113);
  await page.getByLabel("Search tools by name or purpose").fill("Convert nominal APR to APY");
  await expect(page.locator("[data-task]:visible")).toHaveCount(1);
  await page.getByRole("link", { name: /Convert nominal APR to APY/ }).click();
  await expect(page.locator('[data-task-shell] select[name="mode"]')).toHaveValue("apr-to-apy");
  await assertNoSideEffects(page, report);
});

test("new derivative and statistics pages validate inputs and export local reports", async ({ page }) => {
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/tasks/black-scholes-greeks/`);
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-bb-primary]")).toContainText("10.4505");
  const [derivative] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download local JSON" }).click()]);
  const derivativeJson = JSON.parse(await readFile(await derivative.path()!, "utf8"));
  expect(derivativeJson).toMatchObject({ tool: "black-scholes-greeks", version: 1, capability: "browser-local" });
  await page.getByLabel("Annual volatility, %").fill("1e3");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-bb-error]")).toBeVisible();
  await page.goto(`${origin}/tasks/money-weighted-return/`);
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-bc-primary]")).toHaveText("10.00000000");
  const [statistics] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download local JSON" }).click()]);
  const statisticsJson = JSON.parse(await readFile(await statistics.path()!, "utf8"));
  expect(statisticsJson).toMatchObject({ tool: "money-weighted-return", version: 1, capability: "browser-local" });
  await page.getByLabel(/UTC date, signed flow/).fill("2025-02-30,-100\n2026-01-01,110");
  await page.getByRole("button", { name: "Calculate local scenario" }).click();
  await expect(page.locator("[data-bc-error]")).toContainText("Invalid calendar date");
  await assertNoSideEffects(page, report);
});

test("new offline EVM pages inspect data and export without wallet or RPC", async ({ page }) => {
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/tasks/abi-event-log/`);
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-bd-fields]")).toContainText("100");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download local JSON" }).click()]);
  const reportJson = JSON.parse(await readFile(await download.path()!, "utf8"));
  expect(reportJson).toMatchObject({ tool: "abi-event-log", version: 1, capability: "browser-local" });
  await page.getByLabel("Static non-indexed ABI words").fill("0x00");
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-bd-error]")).toContainText("exactly one 32-byte word");
  await page.goto(`${origin}/tasks/eip712-typed-hash/`);
  await page.getByRole("button", { name: "Inspect locally" }).click();
  await expect(page.locator("[data-bd-primary]")).toHaveText(/^0x[0-9a-f]{64}$/);
  await assertNoSideEffects(page, report);
});

test("bounded tick conversion stays responsive at the supported edge on a throttled mobile browser", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CPU throttling measurement uses Chromium CDP");
  const report = await guard(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  try {
    await page.goto(`${origin}/tasks/v3-tick-sqrtprice/`);
    await page.getByLabel(/Signed integer tick/).fill("200000");
    const elapsedMs = await page.evaluate(() => {
      const start = performance.now();
      document.querySelector<HTMLFormElement>("[data-bd-tool] form")?.requestSubmit();
      return performance.now() - start;
    });
    await expect(page.locator("[data-bd-output]")).toBeVisible();
    console.log(`BE_TICK_PERFORMANCE ${JSON.stringify({ browserName, cpuThrottle: 4, viewport: "390x844", tick: 200000, elapsedMs: Math.round(elapsedMs) })}`);
    expect(elapsedMs).toBeLessThan(3000);
    await assertNoSideEffects(page, report);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  }
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
  await expect(page.locator("[data-row-count]")).toHaveText("4 positions");
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
