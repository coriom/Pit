import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { validateTrackedFiles } from "./invariants.mjs";
import { validateAnalyticsDependencies } from "./artifacts.mjs";
function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" });
}
function clean() {
  if (git("status", "--porcelain").trim())
    throw Error(
      "Release requires a clean Git working tree (including untracked files)",
    );
}
function run(command, args) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw Error(
      `Required command failed: ${command} ${args.join(" ")} (exit ${result.status})`,
    );
}
try {
  clean();
  console.log(`Clean release source: ${git("rev-parse", "HEAD").trim()}`);
  if (process.env.PIT_E2E_URL)
    throw Error("PIT_E2E_URL override is forbidden in release checks");
  if (
    Object.keys(process.env).some((k) =>
      /^(?:PIT|PUBLIC)_.*(?:PRIVATE_KEY|MNEMONIC|SEED|API_KEY|API_SECRET|TOKEN|PASSWORD)/i.test(
        k,
      ),
    )
  )
    throw Error("Secret-named PIT environment variable present");
  for (const file of readdirSync("."))
    if (file.startsWith(".env") && file !== ".env.example")
      throw Error(
        "Local environment files are forbidden for the release check",
      );
  const files = new Map(
    git("ls-files", "-z")
      .split("\0")
      .filter(Boolean)
      .map((file) => [file, readFileSync(file)]),
  );
  validateTrackedFiles(files);
  validateAnalyticsDependencies(files);
  console.log(
    "PASS protected fee/network configuration: FEES_ENABLED=false; MAINNET_ENABLED=false; recipients/rates unchanged",
  );
  console.log(
    "PASS exact Taxlot v1 schema SHA256 d8eb339ed7acd7da3b68ef09fe5c1b01c4cc3258cb401a4f2ba8805e7a3b07d7",
  );
  console.log(
    "PASS origin policy: default-deny; exact reviewed PIT staging alias only; legal page unchanged",
  );
  console.log(
    "PASS tracked-file credential patterns and environment-file policy (not a proof against encoded secrets)",
  );
  console.log(
    "PASS no direct analytics dependency or app-source analytics import",
  );
  run("pnpm", ["test"]);
  run("pnpm", ["check"]);
  run("pnpm", ["build"]);
  run("node", ["scripts/release/artifacts.mjs"]);
  run("node", ["scripts/release/discoverability.mjs"]);
  run("pnpm", ["beta:check"]);
  run("node", ["scripts/release/beta-css-isolation.mjs"]);
  run("pnpm", ["toolbox:check"]);
  // Browser tests exercise precisely the production build just created.
  run("pnpm", ["test:e2e"]);
  clean();
  console.log(
    "\nRELEASE CHECK PASS — offline testnet candidate only; no live acceptance or deployment",
  );
} catch (e) {
  console.error(`RELEASE CHECK FAILED: ${e.message}`);
  process.exitCode = 1;
}
