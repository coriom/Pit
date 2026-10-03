import { describe, expect, it } from "vitest";
import {
  TOOLS,
  TOOLBOX_PAGE,
  toolDiscoverability,
} from "../../src/lib/tool-registry";
import {
  assertIndexingPolicy,
  expectedRobots,
  expectedSitemap,
} from "../../scripts/discoverability.mjs";
import { validateDiscoverabilityArtifacts } from "../../scripts/release/discoverability.mjs";

const disabled = { version: 1, indexingEnabled: false, approvedOrigin: null };
const enabled = {
  version: 1,
  indexingEnabled: true,
  approvedOrigin: "https://pit.example",
};

function head(policy: typeof disabled | typeof enabled, route: string) {
  return policy.indexingEnabled
    ? `<link rel="canonical" href="${policy.approvedOrigin}${route}">`
    : '<meta name="robots" content="noindex,nofollow">';
}

function fixtures(policy: typeof disabled | typeof enabled = disabled) {
  const files = new Map<string, string>();
  for (const name of ["index.html", "fees/index.html", "legal/index.html"]) {
    const route = `/${name.replace(/index\.html$/, "")}`;
    files.set(
      name,
      `<html><head>${head(policy, route)}</head><body><h1>PIT</h1></body></html>`,
    );
  }
  files.set(
    "tools/index.html",
    `<html><head>${head(policy, "/tools/")}<title>${TOOLBOX_PAGE.title}</title><meta name="description" content="${TOOLBOX_PAGE.description}"></head><body><h1>Choose a tool.</h1><script type="module">const count = 7;</script></body></html>`,
  );
  for (const tool of TOOLS) {
    const seo = toolDiscoverability(tool);
    const related = tool.relatedToolIds
      .map(
        (id) =>
          `<a href="../${TOOLS.find((entry) => entry.id === id)!.slug}/">${id}</a>`,
      )
      .join("");
    files.set(
      `tools/${tool.slug}/index.html`,
      `<html><head>${head(policy, tool.path)}<title>${seo.title}</title><meta name="description" content="${seo.description}"><meta property="og:title" content="${seo.title}"><meta property="og:description" content="${seo.description}"><meta property="og:type" content="website"><script type="application/ld+json">${JSON.stringify(seo.structuredData)}</script></head><body><span>TESTNET PREVIEW</span><span>${tool.status}</span><h1>${tool.title}</h1>${related}</body></html>`,
    );
  }
  files.set("robots.txt", expectedRobots(policy));
  const sitemap = expectedSitemap(policy, TOOLS);
  if (sitemap) files.set("sitemap.xml", sitemap);
  return files;
}

function rejectMutation(
  change: (files: Map<string, string>) => void,
  reason: RegExp,
) {
  const files = fixtures();
  change(files);
  expect(() =>
    validateDiscoverabilityArtifacts(files, TOOLS, TOOLBOX_PAGE, disabled),
  ).toThrow(reason);
}

describe("registry-driven discoverability release gate", () => {
  it("accepts the default noindex artifact and an explicitly approved HTTPS-origin fixture", () => {
    expect(
      validateDiscoverabilityArtifacts(
        fixtures(),
        TOOLS,
        TOOLBOX_PAGE,
        disabled,
      ),
    ).toEqual({ routes: 11, toolPages: 7, isolatedPages: 4 });
    expect(
      validateDiscoverabilityArtifacts(
        fixtures(enabled),
        TOOLS,
        TOOLBOX_PAGE,
        enabled,
      ),
    ).toEqual({ routes: 11, toolPages: 7, isolatedPages: 4 });
  });
  it("rejects enabled indexing without exact versioned HTTPS approval", () => {
    for (const approvedOrigin of [
      null,
      "http://pit.example",
      "https://pit.example/path",
      "https://pit.example?bypass=1",
      "https://localhost",
      "https://pit.example/",
    ]) {
      expect(() =>
        assertIndexingPolicy({
          version: 1,
          indexingEnabled: true,
          approvedOrigin,
        }),
      ).toThrow();
    }
    expect(() =>
      assertIndexingPolicy({
        ...disabled,
        approvedOrigin: "https://pit.example",
      }),
    ).toThrow();
    expect(() => assertIndexingPolicy({ ...disabled, force: true })).toThrow();
  });
  it("rejects duplicate SEO identities and missing registry metadata", () => {
    expect(() =>
      validateDiscoverabilityArtifacts(
        fixtures(),
        [{ ...TOOLS[0], title: TOOLS[1].title }, ...TOOLS.slice(1)],
        TOOLBOX_PAGE,
        disabled,
      ),
    ).toThrow(/Duplicate or missing SEO title/);
    expect(() =>
      validateDiscoverabilityArtifacts(
        fixtures(),
        [{ ...TOOLS[0], description: "" }, ...TOOLS.slice(1)],
        TOOLBOX_PAGE,
        disabled,
      ),
    ).toThrow(/Duplicate or missing SEO description/);
  });
  it("rejects sitemap or registry route divergence", () => {
    const files = fixtures(enabled);
    files.set(
      "sitemap.xml",
      files.get("sitemap.xml")!.replace("/tools/swap/", "/tools/unregistered/"),
    );
    expect(() =>
      validateDiscoverabilityArtifacts(files, TOOLS, TOOLBOX_PAGE, enabled),
    ).toThrow(/sitemap.xml diverges/);
    rejectMutation(
      (files) => files.set("tools/dead/index.html", "<html></html>"),
      /routes diverge/,
    );
  });
  it("rejects a canonical host different from the approved origin", () => {
    const files = fixtures(enabled);
    files.set(
      "tools/pnl/index.html",
      files
        .get("tools/pnl/index.html")!
        .replace(
          "https://pit.example/tools/pnl/",
          "https://other.example/tools/pnl/",
        ),
    );
    expect(() =>
      validateDiscoverabilityArtifacts(files, TOOLS, TOOLBOX_PAGE, enabled),
    ).toThrow(/Canonical differs/);
  });
  it("rejects indexing leaks in an unverified-origin build", () => {
    rejectMutation(
      (files) =>
        files.set(
          "index.html",
          files.get("index.html")!.replace("noindex,nofollow", "index,follow"),
        ),
      /indexing leak/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace(
              "</head>",
              '<link rel="canonical" href="https://fake.example/tools/pnl/"></head>',
            ),
        ),
      /indexing leak/,
    );
    rejectMutation(
      (files) => files.set("sitemap.xml", "fake"),
      /sitemap.xml diverges/,
    );
  });
  it("rejects missing title, description, H1, structured data or testnet disclosure", () => {
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace("<title>PnL Calculator · PIT Toolbox</title>", ""),
        ),
      /SEO identity/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace('name="description"', 'name="wrong"'),
        ),
      /SEO identity/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace("<h1>PnL Calculator</h1>", ""),
        ),
      /Invalid H1/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace('"@type":"WebApplication"', '"@type":"Product"'),
        ),
      /WebApplication JSON-LD/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/swap/index.html",
          files.get("tools/swap/index.html")!.replace("TESTNET PREVIEW", ""),
        ),
      /testnet disclosure/,
    );
  });
  it("rejects local wallet bundles and calculator network code", () => {
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace(
              "</body>",
              '<script src="../../_astro/Wallet.js"></script></body>',
            ),
        ),
      /references a JS chunk/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/index.html",
          files
            .get("tools/index.html")!
            .replace(
              "</body>",
              '<link rel="modulepreload" href="../_astro/wallet.js"></body>',
            ),
        ),
      /references a JS chunk/,
    );
    rejectMutation(
      (files) =>
        files.set(
          "tools/pnl/index.html",
          files
            .get("tools/pnl/index.html")!
            .replace(
              "</body>",
              '<script>fetch("https://example.com")</script></body>',
            ),
        ),
      /network or wallet execution/,
    );
  });
});
