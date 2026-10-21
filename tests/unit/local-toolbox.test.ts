import { describe, expect, it } from "vitest";
import { LOCAL_TASK_GROUPS, LOCAL_TOOL_IDS, LOCAL_TOOLS } from "../../src/lib/local-toolbox";
import { LOCAL_TOOL_DEFINITIONS, localToolById } from "../../src/lib/local-tool-definitions";
import { TOOLS, toolById } from "../../src/lib/tool-registry";
import { LOCAL_IDS, LOCAL_PAGES } from "../../scripts/release/local-toolbox-host.mjs";
import { publicOriginFromEnv, publicRoutes, publicRobots, publicSitemap } from "../../scripts/release/local-toolbox-publishing.mjs";

describe("isolated local toolbox boundary", () => {
  it("publishes exactly the twenty reviewed local and wallet-free IDs", () => {
    expect(LOCAL_TOOL_IDS).toHaveLength(20);
    expect(LOCAL_IDS).toEqual(LOCAL_TOOL_IDS);
    expect(LOCAL_PAGES).toHaveLength(24);
    expect(new Set(LOCAL_TOOL_IDS).size).toBe(20);
    expect(LOCAL_TOOLS.map((tool) => tool.id)).toEqual(LOCAL_TOOL_IDS);
    expect(LOCAL_TOOLS.every((tool) => tool.executionMode === "local" && tool.walletRequirement === "none" && tool.networkRequirement === "none")).toBe(true);
    for (const id of ["swap", "perps", "wallet", "taxlot-export", "token-approvals"])
      expect(LOCAL_TOOL_IDS).not.toContain(id);
  });

  it("keeps the current build private and requires explicit public prerequisites", () => {
    expect(publicOriginFromEnv({ PIT_TOOLBOX_BUILD_MODE: "private" })).toBeNull();
    expect(() => publicOriginFromEnv({ PIT_TOOLBOX_BUILD_MODE: "public" })).toThrow("approval");
    expect(() => publicOriginFromEnv({ PIT_TOOLBOX_BUILD_MODE: "public", PIT_TOOLBOX_PUBLIC_RELEASE_APPROVED: "yes", PIT_TOOLBOX_PUBLIC_ORIGIN: "http://example.org" })).toThrow("HTTPS origin");
    expect(() => publicOriginFromEnv({ PIT_TOOLBOX_BUILD_MODE: "public", PIT_TOOLBOX_PUBLIC_RELEASE_APPROVED: "yes", PIT_TOOLBOX_PUBLIC_ORIGIN: "https://example.org/path" })).toThrow("HTTPS origin");
    expect(publicOriginFromEnv({ PIT_TOOLBOX_BUILD_MODE: "public", PIT_TOOLBOX_PUBLIC_RELEASE_APPROVED: "yes", PIT_TOOLBOX_PUBLIC_ORIGIN: "https://example.org" })).toBe("https://example.org");
  });

  it("limits a future sitemap to the local catalogue and twenty approved tools", () => {
    const routes = publicRoutes(LOCAL_IDS);
    expect(routes).toHaveLength(22);
    expect(routes).toEqual(["/", "/tools/", ...LOCAL_TOOL_IDS.map((id) => `/tools/${id}/`)]);
    const sitemap = publicSitemap("https://example.org", LOCAL_IDS);
    expect([...sitemap.matchAll(/<loc>/g)]).toHaveLength(22);
    expect(sitemap).toContain("<loc>https://example.org/tools/portfolio-exposure/</loc>");
    expect(sitemap).not.toMatch(/\/tools\/(?:swap|perps|wallet|taxlot-export)\/|\/privacy\/|\/legal\//);
    expect(publicRobots("https://example.org")).toBe("User-agent: *\nAllow: /\nSitemap: https://example.org/sitemap.xml\n");
  });

  it("keeps a single metadata source and current full-registry behavior", () => {
    expect(LOCAL_TOOL_DEFINITIONS.map((tool) => tool.id)).toEqual(TOOLS.filter((tool) => tool.executionMode === "local").map((tool) => tool.id));
    for (const tool of LOCAL_TOOL_DEFINITIONS) {
      expect(localToolById(tool.id)).toBe(tool);
      expect(toolById(tool.id)).toBe(tool);
    }
  });

  it("assigns every approved tool to exactly one task group", () => {
    const grouped = LOCAL_TASK_GROUPS.flatMap((group) => group.ids);
    expect(grouped).toHaveLength(20);
    expect(new Set(grouped)).toEqual(new Set(LOCAL_TOOL_IDS));
  });
});
