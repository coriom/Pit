// PIT_STAGING_ACCEPTANCE_ONLY: read-only protected-staging checks, never bundled.
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const STAGING_ORIGIN = "https://pit-testnet-staging-corioms-projects.vercel.app";
export const PROJECT_ID = "prj_G17pKAhw8I1Ou9bQFFYV6DTB9ydE";
export const DEPLOYMENT_ID = "dpl_DexGHUv9wG64aH1BVPBqQXJaYQro";
export const ACCESS_DIR = join(homedir(), ".pit", "staging-audit-access");
export const SECRET_PATH = join(ACCESS_DIR, "bypass");
const AUTH_PATH = join(homedir(), ".local", "share", "com.vercel.cli", "auth.json");

export function scopedBypassHeaders(url, originalHeaders, secret) {
  const parsed = new URL(url);
  if (parsed.origin !== STAGING_ORIGIN || parsed.username || parsed.password) return null;
  if (!secret || typeof secret !== "string") throw Error("Missing local staging credential");
  const headers = Object.fromEntries(Object.entries(originalHeaders).filter(
    ([name]) => !/^(cookie|authorization|proxy-authorization|x-vercel-protection-bypass)$/i.test(name),
  ));
  return { ...headers, "x-vercel-protection-bypass": secret };
}

export function cliToken() {
  const mode = statSync(AUTH_PATH).mode & 0o777;
  if (mode & 0o077) throw Error("Vercel CLI authentication file is not private");
  const value = JSON.parse(readFileSync(AUTH_PATH, "utf8")).token;
  if (typeof value !== "string" || !value) throw Error("Vercel CLI authentication unavailable");
  return value;
}

async function readVercel(path) {
  try {
    const response = await fetch("https://api.vercel.com" + path, {
      redirect: "manual",
      headers: { Authorization: `Bearer ${cliToken()}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw Error(`Vercel read failed with HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Vercel read ")) throw error;
    throw Error(`Vercel read unavailable: ${error?.name ?? "unknown"}`);
  }
}

export function checkedProject(project) {
  if (
    !project || typeof project !== "object" ||
    project.id !== PROJECT_ID ||
    project.name !== "pit-testnet-staging" ||
    project.ssoProtection?.deploymentType !== "all_except_custom_domains" ||
    !Object.prototype.hasOwnProperty.call(project, "protectionBypass") ||
    !project.protectionBypass || typeof project.protectionBypass !== "object" ||
    Array.isArray(project.protectionBypass)
  ) throw Error("PIT project identity, Vercel Authentication, or bypass metadata differs");
  return project;
}

export async function projectState() {
  return checkedProject(await readVercel(`/v9/projects/${PROJECT_ID}`));
}

export async function assertDeployment() {
  const deployment = await readVercel(`/v13/deployments/${DEPLOYMENT_ID}`);
  if (
    deployment.id !== DEPLOYMENT_ID ||
    deployment.projectId !== PROJECT_ID ||
    deployment.readyState !== "READY" ||
    deployment.target !== "staging" ||
    !deployment.alias?.includes(new URL(STAGING_ORIGIN).host)
  ) throw Error("PIT staging deployment identity or alias differs");
  return deployment;
}

export async function protectedRead(secret, request = fetch) {
  const response = await request(STAGING_ORIGIN + "/__pit-staging-accounting/", {
    redirect: "manual",
    headers: secret ? scopedBypassHeaders(STAGING_ORIGIN, {}, secret) : {},
    signal: AbortSignal.timeout(15_000),
  });
  // Do not expose Location, Set-Cookie, or a response body in diagnostics.
  return { status: response.status, csp: response.headers.get("content-security-policy") };
}

export async function preflight() {
  await assertDeployment();
  const project = await projectState();
  if (Object.keys(project.protectionBypass).length !== 0)
    throw Error("PIT project already has an automation bypass; refuse another");
  if (existsSync(SECRET_PATH)) {
    const entry = lstatSync(SECRET_PATH);
    if (!entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o077))
      throw Error("Local bypass file type or permissions are unsafe");
    throw Error("Local bypass file already exists; revoke before proceeding");
  }
  const unauthenticated = await protectedRead();
  if (unauthenticated.status !== 302) throw Error("PIT staging no longer requires Vercel Authentication");
  return { projectId: PROJECT_ID, deploymentId: DEPLOYMENT_ID, origin: STAGING_ORIGIN, sso: "PASS", existingBypasses: 0 };
}
