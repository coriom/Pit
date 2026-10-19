import { collectArtifacts } from "./artifacts.mjs";
import {
  assertIndexingPolicy,
  canonicalFor,
  expectedRobots,
  expectedSitemap,
  loadPolicy,
  loadRegistry,
  validateRegistry,
} from "../discoverability.mjs";

function tags(html, name) {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];
}
function attr(tag, key) {
  return tag.match(new RegExp(`\\b${key}="([^"]*)"`, "i"))?.[1];
}
function namedMeta(html, name, kind = "name") {
  return tags(html, "meta")
    .filter((tag) => attr(tag, kind) === name)
    .map((tag) => attr(tag, "content"));
}
function textContent(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&")
    .trim();
}
function checkLocalIsolation(html, name) {
  if (/<astro-island\b/i.test(html))
    throw Error(`Local page loads an island: ${name}`);
  for (const link of tags(html, "link")) {
    if (
      attr(link, "rel") === "modulepreload" ||
      (attr(link, "rel") === "preload" && attr(link, "as") === "script")
    )
      throw Error(`Local page references a JS chunk: ${name}`);
  }
  const scripts = html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
  for (const script of scripts) {
    const opening = script.match(/^<script\b[^>]*>/i)?.[0] || "";
    if (attr(opening, "type") === "application/ld+json") continue;
    if (attr(opening, "src"))
      throw Error(`Local page references a JS chunk: ${name}`);
    const source = script.slice(opening.length, -"</script>".length);
    if (
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b|api\.cow\.fi|api\.hyperliquid|\b(?:wagmi|connectkit)\b/i.test(
        source,
      )
    )
      throw Error(
        `Local page includes network or wallet execution code: ${name}`,
      );
  }
}

export function validateDiscoverabilityArtifacts(
  files,
  tools,
  toolbox,
  policy,
) {
  validateRegistry(tools, toolbox);
  const origin = assertIndexingPolicy(policy);
  const expectedPages = new Set([
    "index.html",
    "fees/index.html",
    "legal/index.html",
    "tools/index.html",
    ...tools.map((tool) => `tools/${tool.slug}/index.html`),
  ]);
  const actualPages = [...files.keys()].filter((name) =>
    name.endsWith(".html"),
  );
  if (
    actualPages.length !== expectedPages.size ||
    actualPages.some((name) => !expectedPages.has(name))
  )
    throw Error("Generated routes diverge from registered tools");
  if (files.get("robots.txt") !== expectedRobots(policy))
    throw Error("robots.txt diverges from indexing policy");
  const sitemap = expectedSitemap(policy, tools);
  if ((files.get("sitemap.xml") ?? null) !== sitemap)
    throw Error(
      "sitemap.xml diverges from registered routes or approved origin",
    );

  for (const name of expectedPages) {
    const html = files.get(name);
    if (!html) throw Error(`Missing registered route: ${name}`);
    const canonical = tags(html, "link")
      .filter((tag) => attr(tag, "rel") === "canonical")
      .map((tag) => attr(tag, "href"));
    const robot = namedMeta(html, "robots");
    const ogUrl = namedMeta(html, "og:url", "property");
    if (!origin) {
      if (
        robot.length !== 1 ||
        robot[0] !== "noindex,nofollow" ||
        canonical.length ||
        ogUrl.length
      )
        throw Error(`Unverified-origin indexing leak: ${name}`);
    } else {
      const route = `/${name.replace(/index\.html$/, "")}`;
      if (
        canonical.length !== 1 ||
        canonical[0] !== canonicalFor(origin, route) ||
        robot.some((value) => /noindex/i.test(value))
      )
        throw Error(`Canonical differs from approved origin: ${name}`);
      if (ogUrl.length && ogUrl[0] !== canonical[0])
        throw Error(`Open Graph URL differs from canonical: ${name}`);
    }
  }

  const titles = new Set();
  const descriptions = new Set();
  for (const tool of tools) {
    const name = `tools/${tool.slug}/index.html`;
    const html = files.get(name);
    const title = textContent(
      html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "",
    );
    const description = namedMeta(html, "description");
    const expectedDescription = `${tool.description}${tool.status === "testnet-only" ? " Testnet only." : ""}`;
    if (
      title !== `${tool.title} · PIT Toolbox` ||
      description.length !== 1 ||
      description[0] !== expectedDescription
    )
      throw Error(`Missing or divergent SEO identity: ${name}`);
    if (titles.has(title) || descriptions.has(description[0]))
      throw Error(`Duplicate generated SEO identity: ${name}`);
    titles.add(title);
    descriptions.add(description[0]);
    const headings = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
    if (headings.length !== 1 || textContent(headings[0]) !== tool.title)
      throw Error(`Invalid H1: ${name}`);
    for (const [property, value] of [
      ["og:title", title],
      ["og:description", expectedDescription],
      ["og:type", "website"],
    ])
      if (
        namedMeta(html, property, "property").map(textContent).join("") !==
        value
      )
        throw Error(`Invalid Open Graph ${property}: ${name}`);
    const ld = (html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
    ) || [])[1];
    let data;
    try {
      data = JSON.parse(ld);
    } catch {
      throw Error(`Invalid WebApplication JSON-LD: ${name}`);
    }
    if (
      data["@context"] !== "https://schema.org" ||
      data["@type"] !== "WebApplication" ||
      data.name !== tool.title ||
      data.description !== expectedDescription ||
      data.applicationCategory !== tool.category ||
      Object.keys(data).sort().join(",") !==
        "@context,@type,applicationCategory,description,name"
    )
      throw Error(`Divergent WebApplication JSON-LD: ${name}`);
    if (
      tool.executionMode === "execution" &&
      (!/TESTNET PREVIEW/.test(html) ||
        !/testnet-only/.test(html) ||
        !/Testnet only\./.test(data.description))
    )
      throw Error(`Execution testnet disclosure missing: ${name}`);
    for (const id of tool.relatedToolIds) {
      const related = tools.find((entry) => entry.id === id);
      if (!html.includes(`href="../${related.slug}/"`))
        throw Error(`Related-tool link missing: ${name}`);
    }
    if (tool.executionMode === "local") checkLocalIsolation(html, name);
  }
  const landing = files.get("tools/index.html");
  if (
    !landing.includes(`<title>${toolbox.title}</title>`) ||
    namedMeta(landing, "description").join("") !== toolbox.description
  )
    throw Error("Toolbox landing metadata diverges from registry");
  checkLocalIsolation(landing, "tools/index.html");
  return {
    routes: expectedPages.size,
    toolPages: tools.length,
    isolatedPages:
      tools.filter((tool) => tool.executionMode === "local").length + 1,
  };
}

if (process.argv[1]?.endsWith("/scripts/release/discoverability.mjs")) {
  try {
    const { tools, toolbox } = await loadRegistry();
    const policy = await loadPolicy();
    const result = validateDiscoverabilityArtifacts(
      collectArtifacts(),
      tools,
      toolbox,
      policy,
    );
    console.log(
      `PASS discoverability: ${result.routes} routes; ${result.toolPages} registry tool pages; ${result.isolatedPages} local/discovery pages without wallet or protocol JS; indexing policy and sitemap guards`,
    );
  } catch (error) {
    console.error(`DISCOVERABILITY CHECK FAILED: ${error.message}`);
    process.exitCode = 1;
  }
}
