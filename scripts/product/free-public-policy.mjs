import { createHash } from "node:crypto";

const unresolved = (value) => /\[(?:[^\]]*(?:TODO|REQUIRED|À CONFIRMER|A CONFIRMER|À COMPLÉTER|A COMPLETER)[^\]]*)\]|\bTBD\b/i.test(value);

export function publicFreeOrigin(value) {
  if (typeof value !== "string") throw Error("A reviewed public HTTPS origin is required.");
  let url;
  try { url = new URL(value); } catch { throw Error("Invalid public origin."); }
  if (url.protocol !== "https:" || url.origin !== value.replace(/\/$/, "") || url.pathname !== "/"
    || url.search || url.hash || url.username || url.password || /(?:localhost|pit-v2-private-staging)/i.test(url.hostname))
    throw Error("Public origin must be an explicit approved HTTPS hostname, separate from staging.");
  return url.origin;
}

export function validatePublicFreeConfig(config) {
  if (!config || config.schema !== "pit.free-public-config.v1") throw Error("Unsupported public Free configuration.");
  const origin = publicFreeOrigin(config.origin);
  if (config.legalReviewApproved !== true) throw Error("Publisher and legal review are required before public metadata is generated.");
  for (const key of ["publisherName", "publisherStatus", "publisherAddress", "publisherRegistration", "contactEmail", "privacyEmail", "hostingProvider", "hostingAddress", "jurisdiction"])
    if (typeof config[key] !== "string" || !config[key].trim() || unresolved(config[key]))
      throw Error(`Verified publisher field required: ${key}`);
  for (const key of ["notice", "privacy", "terms", "cookies"])
    if (typeof config.legalText?.[key] !== "string" || config.legalText[key].trim().length < 80
      || unresolved(config.legalText[key]))
      throw Error(`Reviewed legal text required: ${key}`);
  return { ...config, origin };
}

export function renderLegalText(value) {
  const escape = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return value.trim().split(/\n\s*\n/).map((paragraph) =>
    `<p>${escape(paragraph.trim()).replaceAll("\n", "<br>")}</p>`).join("");
}

export function freePublicRoutes(paths) {
  return paths.filter((path) => path.endsWith("index.html") && !path.startsWith("operations/"))
    .map((path) => path === "index.html" ? "/" : `/${path.slice(0, -"index.html".length)}`)
    .sort();
}

export function freeSitemap(origin, routes) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${routes.map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function freeRobots(origin) {
  return `User-agent: *\nAllow: /\nDisallow: /operations/\nSitemap: ${origin}/sitemap.xml\n`;
}

export function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
