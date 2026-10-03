import { build } from "esbuild";
import { readFile, readdir, writeFile, rm } from "node:fs/promises";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export const POLICY_PATH = "config/discoverability.v1.json";
const ROBOTS_OFF = "User-agent: *\nDisallow: /\n";

export function assertIndexingPolicy(policy) {
  if (
    !policy ||
    policy.version !== 1 ||
    typeof policy.indexingEnabled !== "boolean" ||
    !Object.hasOwn(policy, "approvedOrigin") ||
    Object.keys(policy).sort().join(",") !==
      "approvedOrigin,indexingEnabled,version"
  )
    throw Error("Invalid versioned indexing policy");
  if (!policy.indexingEnabled) {
    if (policy.approvedOrigin !== null)
      throw Error("Disabled indexing policy must not assert a public origin");
    return null;
  }
  if (typeof policy.approvedOrigin !== "string")
    throw Error("Indexing requires an explicitly approved HTTPS origin");
  let url;
  try {
    url = new URL(policy.approvedOrigin);
  } catch {
    throw Error("Invalid approved origin");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    url.origin !== policy.approvedOrigin ||
    !url.hostname.includes(".") ||
    /^(?:localhost|127\.|0\.|10\.|192\.168\.|172\.)/i.test(url.hostname)
  )
    throw Error(
      "Approved origin must be an exact dedicated public HTTPS origin",
    );
  return policy.approvedOrigin;
}

export function canonicalFor(origin, path) {
  return `${origin}${path}`;
}

export function expectedRobots(policy) {
  const origin = assertIndexingPolicy(policy);
  return origin
    ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`
    : ROBOTS_OFF;
}

export function expectedSitemap(policy, tools) {
  const origin = assertIndexingPolicy(policy);
  if (!origin) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${tools.map((tool) => `  <url><loc>${canonicalFor(origin, tool.path)}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function validateRegistry(tools, toolbox) {
  if (!tools.length || !toolbox?.title?.trim() || !toolbox?.description?.trim())
    throw Error("Missing toolbox discoverability metadata");
  const unique = (values, label) => {
    if (
      values.some((value) => typeof value !== "string" || !value.trim()) ||
      new Set(values).size !== values.length
    )
      throw Error(`Duplicate or missing ${label}`);
  };
  unique(
    tools.map((t) => t.id),
    "tool ID",
  );
  unique(
    tools.map((t) => t.slug),
    "tool slug",
  );
  unique(
    tools.map((t) => t.path),
    "tool path",
  );
  unique(
    tools.map((t) => t.title),
    "SEO title",
  );
  unique(
    tools.map((t) => t.description),
    "SEO description",
  );
  for (const tool of tools) {
    if (tool.path !== `/tools/${tool.slug}/` || !/^[a-z0-9-]+$/.test(tool.slug))
      throw Error(`Invalid tool route: ${tool.id}`);
    if (
      !Array.isArray(tool.relatedToolIds) ||
      new Set(tool.relatedToolIds).size !== tool.relatedToolIds.length ||
      tool.relatedToolIds.includes(tool.id) ||
      tool.relatedToolIds.some((id) => !tools.some((entry) => entry.id === id))
    )
      throw Error(`Invalid related tools: ${tool.id}`);
  }
}

export async function loadRegistry() {
  const result = await build({
    entryPoints: ["src/lib/tool-registry.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
    logLevel: "silent",
  });
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString("base64")}`
  );
  return { tools: module.TOOLS, toolbox: module.TOOLBOX_PAGE };
}

export async function loadPolicy() {
  return JSON.parse(await readFile(POLICY_PATH, "utf8"));
}

async function htmlPaths(dir = "dist") {
  const paths = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...(await htmlPaths(path)));
    else if (entry.name.endsWith(".html"))
      paths.push(relative("dist", path).replaceAll("\\", "/"));
  }
  return paths.sort();
}

export async function writeDiscoverability() {
  const policy = await loadPolicy();
  const { tools, toolbox } = await loadRegistry();
  validateRegistry(tools, toolbox);
  const origin = assertIndexingPolicy(policy);
  const paths = await htmlPaths();
  for (const name of paths) {
    const file = join("dist", name);
    const html = await readFile(file, "utf8");
    if (!html.includes("</head>")) throw Error(`No HTML head: ${name}`);
    const route = `/${name.replace(/index\.html$/, "")}`;
    const tag = origin
      ? `<link rel="canonical" href="${canonicalFor(origin, route)}">`
      : '<meta name="robots" content="noindex,nofollow">';
    await writeFile(file, html.replace("</head>", `${tag}</head>`));
  }
  await writeFile("dist/robots.txt", expectedRobots(policy));
  const sitemap = expectedSitemap(policy, tools);
  if (sitemap) await writeFile("dist/sitemap.xml", sitemap);
  else await rm("dist/sitemap.xml", { force: true });
  console.log(
    `Discoverability: ${paths.length} no${origin ? "" : "index"} pages; robots.txt; sitemap ${origin ? "generated" : "withheld"}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await writeDiscoverability();
}
