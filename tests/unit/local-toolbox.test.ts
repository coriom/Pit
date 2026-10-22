import { describe, expect, it } from "vitest";
import { LOCAL_TASK_GROUPS, LOCAL_TOOL_IDS, LOCAL_TOOLS } from "../../src/lib/local-toolbox";
import { LOCAL_TOOL_DEFINITIONS, localToolById } from "../../src/lib/local-tool-definitions";
import { TOOLS, toolById } from "../../src/lib/tool-registry";
import { LOCAL_IDS, LOCAL_PAGES, LOCAL_TASK_IDS } from "../../scripts/release/local-toolbox-host.mjs";
import { AVAILABLE_LOCAL_TASKS, COMPLETED_LOCAL_TASKS, LOCAL_TASK_INVENTORY, PENDING_LOCAL_TASKS } from "../../src/lib/local-task-registry";
import { publicOriginFromEnv, publicRoutes, publicRobots, publicSitemap } from "../../scripts/release/local-toolbox-publishing.mjs";

describe("isolated local toolbox boundary", () => {
  it("publishes exactly the twenty reviewed local and wallet-free IDs", () => {
    expect(LOCAL_TOOL_IDS).toHaveLength(20);
    expect(LOCAL_IDS).toEqual(LOCAL_TOOL_IDS);
    expect(LOCAL_PAGES).toHaveLength(145);
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

  it("limits a future sitemap to approved local workspaces and focused tasks", () => {
    const routes = publicRoutes(LOCAL_IDS, LOCAL_TASK_IDS);
    expect(routes).toHaveLength(143);
    expect(routes).toEqual(["/", "/tools/", ...LOCAL_TOOL_IDS.map((id) => `/tools/${id}/`), ...LOCAL_TASK_IDS.map((id) => `/tasks/${id}/`)]);
    const sitemap = publicSitemap("https://example.org", LOCAL_IDS, LOCAL_TASK_IDS);
    expect([...sitemap.matchAll(/<loc>/g)]).toHaveLength(143);
    expect(sitemap).toContain("<loc>https://example.org/tools/portfolio-exposure/</loc>");
    expect(sitemap).not.toMatch(/\/tools\/(?:swap|perps|wallet|taxlot-export)\/|\/privacy\/|\/legal\//);
    expect(publicRobots("https://example.org")).toBe("User-agent: *\nAllow: /\nSitemap: https://example.org/sitemap.xml\n");
  });

  it("reviews specific mode and focused-result tasks against existing local engines", () => {
    expect(AVAILABLE_LOCAL_TASKS).toHaveLength(121);
    expect(LOCAL_TASK_INVENTORY).toHaveLength(127);
    expect(COMPLETED_LOCAL_TASKS).toHaveLength(127);
    expect(PENDING_LOCAL_TASKS).toHaveLength(0);
    expect(LOCAL_TASK_INVENTORY.filter((task) => task.status === "existing")).toHaveLength(6);
    expect(AVAILABLE_LOCAL_TASKS.map((task) => task.id)).toEqual(LOCAL_TASK_IDS);
    expect(AVAILABLE_LOCAL_TASKS.filter((task) => !task.focusLabel)).toHaveLength(79);
    expect(AVAILABLE_LOCAL_TASKS.filter((task) => task.focusLabel)).toHaveLength(42);
    expect(new Set(AVAILABLE_LOCAL_TASKS.filter((task) => !task.focusLabel).map((task) => `${task.engineId}:${task.mode}`)).size).toBe(79);
    expect(new Set(AVAILABLE_LOCAL_TASKS.filter((task) => task.focusLabel).map((task) => `${task.engineId}:${task.mode}:${task.focusLabel}`)).size).toBe(42);
    for (const task of AVAILABLE_LOCAL_TASKS) {
      if (task.status !== "genuinely-new") expect(LOCAL_IDS).toContain(task.engineId);
      expect(task.path).toBe(`/tasks/${task.id}/`);
      expect(task.requiredInputs.length).toBeGreaterThan(0);
      expect(task.question.length).toBeGreaterThan(20);
      expect(task.output.length).toBeGreaterThan(10);
      expect(task.assumptions.length).toBeGreaterThan(20);
    }
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
