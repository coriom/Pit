import "fake-indexeddb/auto";
import { expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import schema from "../schemas/events.v1.json";
import { recordCowFill } from "../src/lib/record-fills";
import { appendEvent, eventsCSV, listEvents, eventDB } from "../src/lib/events";
it("audit: executed ERC20-to-stablecoin producer persists trade; CSV uses those exact records", async () => {
  const owner = "0x2222222222222222222222222222222222222222";
  const fill = {
    orderUid: "audit-stable",
    blockNumber: 1,
    logIndex: 0,
    owner,
    sellToken: "0x1111111111111111111111111111111111111111",
    buyToken: "0x3333333333333333333333333333333333333333",
    sellAmountBeforeFees: "1000000000000000001",
    sellAmount: "1000000000000000002",
    buyAmount: "3000000000",
  };
  const provider = {
    getChainId: async () => 11155111,
    readContract: async ({ address }: any) =>
      address === fill.sellToken ? 18 : 6,
    getBlock: async () => ({ timestamp: 1790683200n }),
  };
  expect(await recordCowFill(fill as never, 11155111, provider as never)).toBe(
    true,
  );
  const records = await listEvents(owner);
  expect(records).toHaveLength(1);
  const ajv = new Ajv();
  addFormats(ajv);
  const validate = ajv.compile(schema);
  for (const e of records)
    expect(validate(e), JSON.stringify(validate.errors)).toBe(true);
  expect(records[0].type).toBe("trade");
  expect(records[0].quantity).toBe("1.000000000000000001");
  expect(records[0].counter_quantity).toBe("3000");
  expect(records[0].fee[0].quantity).toBe("0.000000000000000001");
  const csv = eventsCSV(records);
  expect(csv).toContain('"trade"');
  expect(csv).not.toContain('"disposal"');
  expect(csv).toContain('"1.000000000000000001"');
  expect(csv).toContain('"3000"');
  expect((await (await eventDB()).get("raw", records[0].id)).payload).toEqual(
    fill,
  );
  await expect(
    appendEvent({ ...records[0], quantity: "-1" }, fill),
  ).rejects.toThrow(/schema/);
  expect(() => eventsCSV([{ ...records[0], quantity: "-1" }])).toThrow(
    /schema/,
  );
  expect(await recordCowFill(fill as never, 11155111, provider as never)).toBe(
    false,
  );
  expect(await listEvents(owner)).toEqual(records);
});
