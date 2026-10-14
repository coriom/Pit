// PIT_STAGING_ACCEPTANCE_ONLY: authorized mutation lifecycle, never bundled.
import { randomInt } from "node:crypto";
import {
  constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync,
  rmdirSync, unlinkSync, writeSync, closeSync,
} from "node:fs";
import {
  ACCESS_DIR, PROJECT_ID, SECRET_PATH, cliToken,
  projectState, protectedRead,
} from "./staging-readonly.mjs";
import { confirmRevocation } from "./staging-lifecycle.mjs";
import { httpFailureDiagnostic } from "./staging-diagnostics.mjs";

const SECRET_FORMAT = /^[A-Za-z0-9]{32}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const GENERATION_NOTE = "Temporary PIT protected staging browser acceptance";

function coded(code, diagnostic) {
  const error = Error(code);
  error.safeCode = code;
  if (diagnostic) error.diagnostic = diagnostic;
  return error;
}

export function generateSecretValue() {
  // Vercel's caller-supplied generate.secret contract is exactly 32 alphanumeric characters.
  return Array.from({ length: 32 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function mutationFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw coded("INVALID_MUTATION_REQUEST");
  const keys = Object.keys(body);
  if (keys.length !== 1) throw coded("INVALID_MUTATION_REQUEST");
  if (keys[0] === "generate") {
    const entry = body.generate;
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      Object.keys(entry).some((key) => !["secret", "note"].includes(key)) ||
      !SECRET_FORMAT.test(entry.secret) || typeof entry.note !== "string" || entry.note.length > 100)
      throw coded("INVALID_MUTATION_REQUEST");
    return ["generate.secret:string[32-alphanumeric]", "generate.note:string[max100]"];
  }
  if (keys[0] === "revoke") {
    const entry = body.revoke;
    if (!entry || typeof entry !== "object" || Array.isArray(entry) ||
      Object.keys(entry).length !== 2 || typeof entry.secret !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(entry.secret) || entry.regenerate !== false)
      throw coded("INVALID_MUTATION_REQUEST");
    return ["revoke.secret:string", "revoke.regenerate:boolean(false)"];
  }
  throw coded("INVALID_MUTATION_REQUEST");
}

export async function mutateVercel(body, { request = fetch, token = cliToken } = {}) {
  const requestFields = mutationFields(body);
  try {
    const response = await request(`https://api.vercel.com/v1/projects/${PROJECT_ID}/protection-bypass`, {
      method: "PATCH",
      redirect: "manual",
      headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status !== 200) {
      const diagnostic = await httpFailureDiagnostic(response, body.generate?.secret ?? body.revoke.secret, requestFields);
      throw coded(response.ok ? "VERCEL_UNEXPECTED_STATUS" : `VERCEL_HTTP_${response.status}`, diagnostic);
    }
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
  // The legacy 43-character form is accepted only for recovery of an interrupted old run.
  if (!SECRET_FORMAT.test(secret) && !/^[A-Za-z0-9_-]{43}$/.test(secret))
    throw Error("Local bypass file format is invalid");
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
  const secret = generateSecretValue();
  saveSecret(secret);
  return secret;
}

export async function createRemote(secret) {
  // Caller-supplied value avoids Vercel generating an inaccessible server-side secret.
  await mutateVercel({ generate: { secret, note: GENERATION_NOTE } });
}

export async function revokeRemote(secret) {
  await mutateVercel({ revoke: { secret, regenerate: false } });
}

export async function verifyRevocation(secret, onObservation, context) {
  return confirmRevocation(secret, {
    projectState, protectedRead,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }, onObservation, context);
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
  const revocation = await verifyRevocation(secret, undefined, { creationResponse: "UNKNOWN", revokeRequest });
  if (["REVOCATION_CONFIRMED", "NO_ACTIVE_BYPASS_OBSERVED"].includes(revocation)) deleteSecret();
  return { status: revocation, revokeRequest };
}
