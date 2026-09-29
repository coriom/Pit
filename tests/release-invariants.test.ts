import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateTrackedFiles } from "../scripts/release/invariants.mjs";
const paths = Object.keys(
  JSON.parse(readFileSync("scripts/release/protected.json", "utf8")),
);
const original = () => new Map(paths.map((p) => [p, readFileSync(p)]));
it("release invariant verifier accepts the exact protected configuration", () => {
  expect(() => validateTrackedFiles(original())).not.toThrow();
});
it.each(paths)("release invariant fails closed when %s changes", (path) => {
  const files = original();
  files.set(path, Buffer.from("changed"));
  expect(() => validateTrackedFiles(files)).toThrow(
    "Protected release identity changed",
  );
});
it.each([".env.local", "nested/.env", "wallet.keystore"])(
  "release refuses tracked %s without printing contents",
  (path) => {
    const files = original();
    files.set(path, Buffer.from("synthetic"));
    expect(() => validateTrackedFiles(files)).toThrow("Forbidden");
  },
);
it("release refuses a credential assignment assembled solely in memory", () => {
  const files = original();
  files.set(
    "fixture.ts",
    Buffer.from(["api", "Key", ' = "', "synthetic-value", '"'].join("")),
  );
  expect(() => validateTrackedFiles(files)).toThrow("Credential candidate");
});
