import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = "dist";
async function htmlPages(dir = root) {
  const pages = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) pages.push(...(await htmlPages(path)));
    else if (entry.name.endsWith(".html"))
      pages.push(path.slice(root.length + 1));
  }
  return pages.sort();
}
const pages = await htmlPages();
if (!pages.length) throw new Error("No generated HTML pages for CSP headers");
const policies = await Promise.all(
  pages.map(async (name) => {
    const html = await readFile(join(root, name), "utf8");
    const meta = html.match(
      /<meta\s+http-equiv="content-security-policy"\s+content="([^"]+)"\s*\/?\s*>/i,
    );
    if (!meta) throw new Error(`Generated CSP missing: ${name}`);
    const policy = meta[1].replaceAll("&amp;", "&");
    if (
      !policy.includes("default-src 'none'") ||
      !policy.includes("script-src 'self'")
    )
      throw new Error(
        `Generated CSP is weaker than the reviewed baseline: ${name}`,
      );
    return policy;
  }),
);
if (new Set(policies).size !== 1)
  throw new Error(
    "Static pages have different CSPs; cannot apply one global header",
  );
const base = await readFile(join(root, "_headers"), "utf8");
if (/^\s*Content-Security-Policy\s*:/im.test(base))
  throw new Error(
    "Static headers already define a CSP; reconcile policies first",
  );
const value = `${policies[0].replace(/;+$/, "")}; frame-ancestors 'none'`;
if (`  Content-Security-Policy: ${value}`.length > 2000)
  throw new Error(
    "Generated CSP exceeds the Cloudflare Pages header line limit",
  );
if (value.includes("\n") || value.includes("\r"))
  throw new Error("Generated CSP contains a line break");
await writeFile(
  join(root, "_headers"),
  `${base.trimEnd()}\n  Content-Security-Policy: ${value}\n`,
);
console.log(
  "Static Pages HTTP CSP generated from Astro meta CSP, with frame-ancestors 'none'.",
);
