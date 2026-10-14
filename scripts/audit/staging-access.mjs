// PIT_STAGING_ACCEPTANCE_ONLY: authorized mutation lifecycle, never bundled.
import { randomBytes } from "node:crypto";
import {
  constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync,
  rmdirSync, unlinkSync, writeSync, closeSync,
} from "node:fs";
import {
  ACCESS_DIR, PROJECT_ID, SECRET_PATH, cliToken,
  projectState, protectedRead,
} from "./staging-readonly.mjs";
import { confirmRevocation } from "./staging-lifecycle.mjs";

function coded(code) {
  const error = Error(code);
  error.safeCode = code;
  return error;
}

export async function mutateVercel(body, { request = fetch, token = cliToken } = {}) {
  try {
    const response = await request(`https://api.vercel.com/v1/projects/${PROJECT_ID}/protection-bypass`, {
      method: "PATCH",
      redirect: "manual",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw coded(`VERCEL_HTTP_${response.status}`);
    // The response could echo the bypass. Never read, parse, return, or log it.
  } catch (error) {
    if (error?.safeCode) throw error;
    throw coded(error?.name === "TimeoutError" ? "VERCEL_REQUEST_TIMEOUT" : "VERCEL_REQUEST_UNAVAILABLE");
  }
}

export function existingSecret() {
  if (!existsSync(SECRET_PATH)) return null;
  const stat = lstatSync(SECRET_PATH);
  if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077))
    throw Error("Local bypass file type or permissions are unsafe");
  const secret = readFileSync(SECRET_PATH, "utf8");
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) throw Error("Local bypass file format is invalid");
  return secret;
}

function saveSecret(secret) {
  mkdirSync(ACCESS_DIR, { recursive: true, mode: 0o700 });
  const directory = lstatSync(ACCESS_DIR);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (directory.mode & 0o077))
    throw Error("Local bypass directory is unsafe");
  const fd = openSync(SECRET_PATH, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
  try {
    if (writeSync(fd, secret) !== Buffer.byteLength(secret)) throw coded("LOCAL_SECRET_WRITE_FAILED");
  } catch (error) {
    closeSync(fd);
    unlinkSync(SECRET_PATH);
    throw error;
  }
  closeSync(fd);
}

export function retainSecret() {
  const secret = randomBytes(32).toString("base64url");
  saveSecret(secret);
  return secret;
}

export async function createRemote(secret) {
  // Caller-supplied value avoids Vercel generating an inaccessible server-side secret.
  await mutateVercel({ generate: { secret, note: "Temporary PIT protected staging browser acceptance" } });
}

export async function revokeRemote(secret) {
  await mutateVercel({ revoke: { secret, regenerate: false } });
}

export async function verifyRevocation(secret, onObservation) {
  return confirmRevocation(secret, {
    projectState, protectedRead,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }, onObservation);
}

export function deleteSecret() {
  unlinkSync(SECRET_PATH);
  try { rmdirSync(ACCESS_DIR); } catch { /* Leave unrelated files untouched. */ }
}

export async function recoverRetainedSecret() {
  const secret = existingSecret();
  if (!secret) return { status: "AUTHORIZATION_REQUIRED", reason: "NO_RETAINED_SECRET" };
  let revokeRequest = "HTTP_SUCCESS";
  try { await revokeRemote(secret); } catch { revokeRequest = "REVOCATION_REQUEST_FAILED"; }
  const revocation = await verifyRevocation(secret);
  if (revocation === "REVOCATION_CONFIRMED") deleteSecret();
  return { status: revocation, revokeRequest };
}
