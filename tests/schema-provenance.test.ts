import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
it("uses the exact Taxlot schema snapshot", () => {
  expect(
    createHash("sha256")
      .update(readFileSync("schemas/events.v1.json"))
      .digest("hex"),
  ).toBe("d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7");
});
