import { expect, test } from "@playwright/test";
import { TOOLS } from "../../src/lib/tool-registry";

test("all twenty local tool pages load without network, wallet or accounting storage", async ({
  page,
  browserName,
}) => {
  test.setTimeout(120_000);
  const unexpected: string[] = [],
    runtime: string[] = [];
  page.on("pageerror", (error) => runtime.push(error.message));
  await page.route(/^https?:\/\//, (route) => {
    const url = new URL(route.request().url());
    if (
      url.origin === "http://127.0.0.1:4398" &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.includes("rpc")
    )
      return route.continue();
    unexpected.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.addInitScript(() => {
    (window as any).__aoForbidden = [];
    (window as any).ethereum = {
      request: async ({ method }: { method: string }) => {
        (window as any).__aoForbidden.push(`wallet:${method}`);
        throw Error("Wallet forbidden");
      },
    };
    indexedDB.open = ((..._args: unknown[]) => {
      (window as any).__aoForbidden.push("indexedDB.open");
      throw Error("IndexedDB forbidden");
    }) as typeof indexedDB.open;
    for (const name of ["getItem", "setItem", "removeItem", "clear"] as const) {
      (Storage.prototype[name] as any) = function () {
        (window as any).__aoForbidden.push(`storage:${name}`);
        throw Error("Storage forbidden");
      };
    }
  });
  const local = TOOLS.filter((tool) => tool.executionMode === "local");
  expect(local).toHaveLength(20);
  for (const tool of local) {
    expect((await page.goto(tool.path))?.status(), tool.path).toBe(200);
    await expect(
      page.getByRole("heading", { name: tool.title, exact: true }),
    ).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex,nofollow",
    );
    expect(
      await page.evaluate(() => (window as any).__aoForbidden),
      tool.path,
    ).toEqual([]);
  }
  expect(unexpected).toEqual([]);
  expect(runtime).toEqual([]);
  console.log(
    `AO_LOCAL_CATALOGUE ${browserName} ${local.length} local routes/privacy PASS`,
  );
});
