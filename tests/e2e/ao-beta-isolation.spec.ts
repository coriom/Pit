import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { validateHostPackage } from "../../scripts/release/read-only-beta-host.mjs";

test("reviewed beta host package renders only its static allowlist with CSP", async ({
  page,
  browserName,
}) => {
  const reviewed = await validateHostPackage();
  expect(reviewed.hostSha256).toBe(
    "f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425",
  );
  const headers = Object.fromEntries(
    reviewed.config.headers[0].headers.map(
      ({ key, value }: { key: string; value: string }) => [key, value],
    ),
  );
  const allowed = new Set(reviewed.publicFiles);
  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    const file = pathname.endsWith("/")
      ? `${pathname.slice(1)}index.html`
      : pathname.slice(1);
    for (const [key, value] of Object.entries(headers))
      response.setHeader(key, value as string);
    if (!allowed.has(file)) {
      response.writeHead(404);
      response.end("Not Found");
      return;
    }
    response.setHeader(
      "Content-Type",
      file.endsWith(".css")
        ? "text/css"
        : file.endsWith(".html")
          ? "text/html"
          : "text/plain",
    );
    response.writeHead(200);
    response.end(await readFile(join("dist-readonly-beta-host/public", file)));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Expected TCP listener");
  const origin = `http://127.0.0.1:${address.port}`;
  const unexpected: string[] = [],
    runtime: string[] = [];
  page.on("pageerror", (error) => runtime.push(error.message));
  await page.route(/^https?:\/\//, (route) => {
    if (new URL(route.request().url()).origin === origin)
      return route.continue();
    unexpected.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  try {
    for (const file of reviewed.publicFiles.filter((name: string) =>
      name.endsWith("index.html"),
    )) {
      const route =
        file === "index.html" ? "/" : `/${file.slice(0, -"index.html".length)}`;
      const result = await page.goto(`${origin}${route}`);
      expect(result?.status(), route).toBe(200);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex,nofollow",
      );
      expect(await page.locator("h1").first().isVisible()).toBe(true);
    }
    for (const route of [
      "/tools/swap/",
      "/tools/perps/",
      "/tools/wallet/",
      "/tools/taxlot-export/",
    ])
      expect((await page.goto(`${origin}${route}`))?.status(), route).toBe(404);
    await page.goto(origin);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.documentElement).backgroundColor,
      ),
    ).toBe("rgb(12, 18, 17)");
    await page.evaluate(() => {
      const script = document.createElement("script");
      script.textContent = "window.__aoInjected = true";
      document.body.append(script);
    });
    expect(
      await page.evaluate(() => (window as any).__aoInjected),
    ).toBeUndefined();
    expect(unexpected).toEqual([]);
    expect(runtime).toEqual([]);
    console.log(
      `AO_BETA_BROWSER ${browserName} 8 pages/4 excluded routes/CSP/CSS PASS`,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
