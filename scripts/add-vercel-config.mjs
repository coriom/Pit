import { readFile, writeFile } from "node:fs/promises";

// The CSP contains Astro-generated inline-script hashes. Derive Vercel's
// response headers from the same built policy as the existing static artifact.
const text = await readFile("dist/_headers", "utf8");
const lines = text.trimEnd().split("\n");
if (lines[0] !== "/*") throw Error("Unexpected static header scope");
const headers = lines.slice(1).map((line) => {
  const match = line.match(/^  ([A-Za-z-]+): ([^\r\n]+)$/);
  if (!match) throw Error("Malformed static security header");
  return { key: match[1], value: match[2] };
});
const keys = new Set(headers.map((header) => header.key.toLowerCase()));
if (keys.size !== headers.length ||
    !["content-security-policy", "x-content-type-options", "referrer-policy",
      "permissions-policy", "x-frame-options"].every((key) => keys.has(key)))
  throw Error("Incomplete or duplicate static security headers");
const csp = headers.find((header) => header.key === "Content-Security-Policy")?.value;
if (!csp?.includes("frame-ancestors 'none'") ||
    !csp.includes("script-src 'self' 'sha256-"))
  throw Error("Built CSP hashes missing");
await writeFile("dist/vercel.json", JSON.stringify({
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: null,
  outputDirectory: ".",
  headers: [{ source: "/(.*)", headers }],
}, null, 2) + "\n");
console.log("Vercel static response headers generated from built CSP hashes.");
