import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateTrackedFiles } from "../scripts/release/invariants.mjs";
const paths = Object.keys(
  JSON.parse(readFileSync("scripts/release/protected.json", "utf8")),
);
const original = () => new Map([
  ...paths.map((p) => [p, readFileSync(p)] as const),
  ["src/lib/uniswap-execution.ts", readFileSync("src/lib/uniswap-execution.ts")] as const,
]);
it("release invariant verifier accepts the exact protected configuration", () => {
  const files = original();
  files.set("src/lib/uniswap-execution.ts", readFileSync("src/lib/uniswap-execution.ts"));
  expect(() => validateTrackedFiles(files)).not.toThrow();
});
it("release refuses an accepted Uniswap execution gate", () => {
  const files = original();
  files.set("src/lib/uniswap-execution.ts", Buffer.from(
    readFileSync("src/lib/uniswap-execution.ts", "utf8")
      .replace("UNISWAP_EXECUTION_ACCEPTED = false", "UNISWAP_EXECUTION_ACCEPTED = true"),
  ));
  expect(() => validateTrackedFiles(files)).toThrow("Uniswap execution acceptance gate");
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
it("release refuses an unreviewed private-key-shaped value in docs evidence", () => {
  const files = original();
  files.set("docs/evidence.txt", Buffer.from("0x" + "a".repeat(64)));
  expect(() => validateTrackedFiles(files)).toThrow("Credential candidate");
});
it("tracked source accepts the public URL but rejects a neighboring credential", () => {
  const files = original();
  const source = readFileSync("src/lib/quote-markets.ts");
  files.set("src/lib/quote-markets.ts", source);
  expect(() => validateTrackedFiles(files)).not.toThrow();
  files.set(
    "src/lib/quote-markets.ts",
    Buffer.from(source.toString() + ["API_", "KEY=", '"syntheticvalue123456"'].join("")),
  );
  expect(() => validateTrackedFiles(files)).toThrow("Credential candidate");
});
it("rejects a test signer import or secret path from production source", () => {
  for (const value of ["import '../scripts/audit/autonomous-signer.mjs'", "/home/corio/.pit/test-operator/key"]) {
    const files = original();
    files.set("src/lib/unsafe.ts", Buffer.from(value));
    expect(() => validateTrackedFiles(files)).toThrow("Test signer import or secret path");
  }
});
it("rejects a staging credential-loader or runner import from production source", () => {
  for (const value of ["import '../scripts/audit/staging-access.mjs'", "import '../scripts/audit/staging-diagnostics.mjs'", "PIT_STAGING_ACCEPTANCE_ONLY"]) {
    const files = original();
    files.set("src/lib/unsafe.ts", Buffer.from(value));
    expect(() => validateTrackedFiles(files)).toThrow("Staging runner import in production source");
  }
});

it("allows only the exact reviewed Sourcify publication hashes", () => {
  const files = original();
  for (const path of [
    "deployments/base-sepolia-paid-bound-candidate.json",
    "deployments/base-sepolia-paid-execution.json",
    "deployments/base-sepolia-paid-sourcify-v2-review.json",
  ]) files.set(path, readFileSync(path));
  expect(() => validateTrackedFiles(files)).not.toThrow();
  const path = "deployments/base-sepolia-paid-sourcify-v2-review.json";
  files.set(path, Buffer.from(readFileSync(path, "utf8") + " "));
  expect(() => validateTrackedFiles(files)).toThrow("Paid Sourcify review digest changed");
});
