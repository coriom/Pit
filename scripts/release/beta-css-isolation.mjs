import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { validateHostPackage } from "./read-only-beta-host.mjs";

const expected =
  "f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425";
const fixture = "src/lib/ao-unrelated-tailwind-fixture.ts";
const before = await validateHostPackage();
if (before.hostSha256 !== expected)
  throw Error(
    `Reviewed beta package drifted before fixture: ${before.hostSha256}`,
  );
let created = false;
try {
  // This unimported full-app text deliberately contains valid Tailwind utilities.
  // Automatic project-wide scanning used to contaminate the beta CSS with them.
  await writeFile(
    fixture,
    'export const unrelatedAoText = "bg-fuchsia-500 text-cyan-400 p-7";\n',
    { flag: "wx" },
  );
  created = true;
  const build = spawnSync("pnpm", ["beta:check"], { stdio: "inherit" });
  if (build.error || build.status !== 0)
    throw Error(
      `Beta fixture build failed: ${build.error?.message ?? build.status}`,
    );
  const after = await validateHostPackage();
  if (
    after.hostSha256 !== expected ||
    JSON.stringify(after.hostFiles) !== JSON.stringify(before.hostFiles)
  )
    throw Error(
      `Unrelated source contaminated reviewed beta package: ${after.hostSha256}`,
    );
  const cssPath = `dist-readonly-beta-host/public/${after.publicFiles.find((file) => file.startsWith("_astro/"))}`;
  const css = await readFile(cssPath, "utf8");
  if (
    css.includes(".bg-fuchsia-500") ||
    css.includes(".text-cyan-400") ||
    css.includes(".p-7")
  )
    throw Error("Unrelated source contaminated beta CSS utilities");
  console.log(
    `PASS beta CSS source isolation — fixture did not alter ${after.hostFiles.length}-file package SHA-256 ${after.hostSha256}`,
  );
} finally {
  if (created) await rm(fixture, { force: true });
}
