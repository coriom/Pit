// PIT_STAGING_ACCEPTANCE_ONLY: read-only preflight; cannot create a bypass.
import { preflight } from "./staging-readonly.mjs";

try {
  const result = await preflight();
  console.log(JSON.stringify({ status: "AUTHORIZATION REQUIRED", ...result, secretCreated: false }));
} catch (error) {
  console.error(JSON.stringify({
    status: "BLOCKED",
    reason: error instanceof Error ? error.message : "unknown",
    secretCreated: false,
  }));
  process.exitCode = 2;
}
