import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const protectedFiles = JSON.parse(
  readFileSync(new URL("./protected.json", import.meta.url)),
);
export function validateTrackedFiles(files) {
  for (const [file, expected] of Object.entries(protectedFiles)) {
    if (
      !files.has(file) ||
      createHash("sha256").update(files.get(file)).digest("hex") !== expected
    )
      throw Error(`Protected release identity changed: ${file}`);
  }
  // Values are never printed. Pattern scan complements review, not a proof of secret absence.
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|sk-(?:proj-)?[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{15,})\b/,
    /(?:private[_-]?key|secret[_-]?key|api[_-]?(?:key|token)|access[_-]?token|client[_-]?secret|mnemonic|seed[_-]?phrase|wallet[_-]?(?:password|credential))\s*[=:]\s*["'][^"'\r\n]{8,}["']/i,
    /https?:\/\/[^\s"']*(?:infura\.io\/v3\/|alchemy\.com\/v2\/)[A-Za-z0-9_-]{12,}|https?:\/\/[^\s/:"']+:[^\s/@"']+@[^\s"']+/,
    /[?&](?:api[_-]?key|token|secret|password)=[A-Za-z0-9_%+-]{8,}/i,
    /(?:^|[^0-9A-Za-z])0x[0-9a-fA-F]{64}(?![0-9A-Za-z])/,
  ];
  for (const [file, data] of files) {
    if (/^src\//.test(file) &&
        /autonomous-signer|test-operator\/key|PIT_AUTONOMOUS_SIGNER_TEST_ONLY/i.test(data.toString()))
      throw Error(`Test signer import or secret path in production source: ${file}`);
    if (/(?:^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example")
      throw Error(`Forbidden tracked environment file: ${file}`);
    if (
      /\.(?:pem|key|keystore|p12|pfx)$|(?:^|\/)id_(?:rsa|ed25519)$/.test(file)
    )
      throw Error(`Forbidden credential file: ${file}`);
    // Text scan includes historical evidence; binary files require manual review.
    if (data.includes(0)) continue;
    const text = data.toString();
    for (const pattern of patterns) {
      if (pattern.test(text))
        throw Error(`Credential candidate (review required): ${file}`);
    }
  }
}
