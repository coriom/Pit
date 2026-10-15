// PIT_AUTONOMOUS_SIGNER_TEST_ONLY — local read-only acceptance; never bundle.
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTrackedFiles } from "../release/invariants.mjs";

export const acceptancePath = "src/lib/uniswap-execution.ts";
export const fromLine = "export const UNISWAP_EXECUTION_ACCEPTED = false;";
export const toLine = "export const UNISWAP_EXECUTION_ACCEPTED = true;";
export const transformationId = "PIT-Z2-EXACT-ONE-LINE-GATE-v1";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function transformAcceptanceSource(original) {
  if (original.split(fromLine).length !== 2 || original.includes(toLine))
    throw Error("ACCEPTANCE_SOURCE_UNEXPECTED");
  return original.replace(fromLine, toLine);
}
export function verifyAcceptanceDiff(original, transformed, changedPaths) {
  if (transformed !== transformAcceptanceSource(original) ||
      changedPaths.length !== 1 || changedPaths[0] !== acceptancePath)
    throw Error("ACCEPTANCE_SOURCE_UNEXPECTED");
  return { sourceSha256: sha256(original), transformedSha256: sha256(transformed),
    transformationId, transformedPath: acceptancePath };
}
export function validateLiveMode(args, env) {
  if (args.includes("--z3-live")) throw Error("Z3_AUTHORIZATION_CONSUMED");
  const live = args.includes("--z5-live");
  if (live && env.PIT_Z5_AUTHORIZED !== "yes")
    throw Error("UNISWAP_LIVE_RUN_NOT_AUTHORIZED");
  return live;
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === self) {
  const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const live = validateLiveMode(process.argv, process.env);
  const baseIndex = process.argv.indexOf("--base");
  const base = baseIndex >= 0 ? process.argv[baseIndex + 1] : git("rev-parse", "HEAD");
  if (!/^[0-9a-f]{40}$/.test(base) || git("status", "--short"))
    throw Error("ACCEPTANCE_BASE_NOT_CLEAN");
  const parent = await mkdtemp("/tmp/pit-z2-acceptance-");
  const worktree = join(parent, "source");
  let attached = false;
  try {
    git("worktree", "add", "--detach", worktree, base);
    attached = true;
    await symlink(join(repo, "node_modules"), join(worktree, "node_modules"), "dir");
    const original = execFileSync("git", ["show", `${base}:${acceptancePath}`],
      { cwd: repo, encoding: "utf8" });
    const transformed = transformAcceptanceSource(original);
    await writeFile(join(worktree, acceptancePath), transformed);
    const changedPaths = execFileSync("git", ["diff", "--name-only"],
      { cwd: worktree, encoding: "utf8" }).trim().split("\n").filter(Boolean);
    const identity = verifyAcceptanceDiff(original,
      await readFile(join(worktree, acceptancePath), "utf8"), changedPaths);
    let gateRejected = false;
    try { validateTrackedFiles(new Map([[acceptancePath, Buffer.from(transformed)]])); }
    catch (error) {
      gateRejected = error?.message ===
        "Uniswap execution acceptance gate must remain disabled in release source";
    }
    if (!gateRejected) throw Error("ACCEPTANCE_RELEASE_GUARD_FAILED");
    console.log(JSON.stringify({ stage: "ACCEPTANCE_SOURCE", base, ...identity,
      changedPaths, releaseGateRejected: true, loopbackOnly: true }));
    const runnerArgs = [join(repo, "scripts/audit/operator-uniswap.mjs")];
    if (process.argv.includes("--z3-read-only")) runnerArgs.push("--z3-read-only");
    if (process.argv.includes("--z4-mock-checkpoint")) runnerArgs.push("--z4-mock-checkpoint");
    if (live) {
      runnerArgs.push("--z5-live");
    }
    const run = spawnSync("node", runnerArgs, {
      cwd: worktree, encoding: "utf8", timeout: live ? 600000 : 300000,
      maxBuffer: 2 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", HOME: process.env.HOME ?? "/tmp",
        XDG_CACHE_HOME: process.env.XDG_CACHE_HOME ?? join(process.env.HOME ?? "/tmp", ".cache"),
        ...(live ? { PIT_Z5_EVIDENCE_DIR: join(repo, "docs/audit/phase-z"),
          PIT_Z5_AUTHORIZED: "yes" } : {}) },
    });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.error || run.status !== 0) throw Error("ACCEPTANCE_BROWSER_BLOCKED");
  } finally {
    if (attached) git("worktree", "remove", "--force", worktree);
    await rm(parent, { recursive: true, force: true });
  }
}
