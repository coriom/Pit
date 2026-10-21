export const publicRoutes = (ids, taskIds = []) => ["/", "/tools/", ...ids.map((id) => `/tools/${id}/`), ...taskIds.map((id) => `/tasks/${id}/`)];

export function publicOriginFromEnv(env = process.env) {
  if (env.PIT_TOOLBOX_BUILD_MODE !== "public") return null;
  if (env.PIT_TOOLBOX_PUBLIC_RELEASE_APPROVED !== "yes")
    throw Error("Public toolbox build requires separate operator approval");
  const input = env.PIT_TOOLBOX_PUBLIC_ORIGIN;
  if (!input) throw Error("Public toolbox build requires an approved HTTPS origin");
  let url;
  try { url = new URL(input); } catch { throw Error("Invalid public toolbox origin"); }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" ||
      url.search || url.hash || url.origin !== input.replace(/\/$/, ""))
    throw Error("Public toolbox origin must be an HTTPS origin without credentials, path or query");
  return url.origin;
}

export function publicSitemap(origin, ids, taskIds = []) {
  if (!/^https:\/\/[^/?#]+$/.test(origin)) throw Error("Invalid sitemap origin");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${publicRoutes(ids, taskIds).map((path) => `  <url><loc>${origin}${path}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function publicRobots(origin) {
  return `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`;
}
