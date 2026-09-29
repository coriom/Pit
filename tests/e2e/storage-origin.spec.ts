import { test, expect } from "@playwright/test";
test("audit: shared-origin IPFS paths cannot isolate PIT IndexedDB", async ({
  page,
}) => {
  // Deterministic hosting-model reproduction, not a deployed gateway assertion.
  await page.route("**/ipfs/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Origin isolation audit fixture</title>",
    }),
  );
  await page.goto("/ipfs/pit-audit-cid/");
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("pit-taxlot-v1", 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore("events", { keyPath: "id" });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("events", "readwrite");
        tx.objectStore("events").put({
          id: "audit-record",
          account: "synthetic-public-account",
          quantity: "1",
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.goto("/ipfs/untrusted-audit-cid/");
  const stolen = await page.evaluate(
    async () =>
      new Promise<any>((resolve, reject) => {
        const req = indexedDB.open("pit-taxlot-v1", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("events", "readwrite");
          const read = tx.objectStore("events").get("audit-record");
          read.onsuccess = () => {
            const record = read.result;
            tx.objectStore("events").delete("audit-record");
            tx.oncomplete = () => {
              db.close();
              resolve(record);
            };
          };
        };
      }),
  );
  expect(stolen).toEqual({
    id: "audit-record",
    account: "synthetic-public-account",
    quantity: "1",
  });
});
