import { describe, expect, it } from "vitest";
import offline from "../../docs/product/PIT-TOOLBOX-V1-TASKS.json";
import progress from "../../docs/product/PIT-BJ-BS-PROGRESS.json";
import surfaces from "../../docs/product/PIT-BJ-BS-SURFACES.json";
import { EXPLORER_CATEGORIES, EXPLORER_IDS, EXPLORER_TOOLS } from "../../src/lib/explorer-registry";

describe("separate PIT task surfaces", () => {
  it("has exact distinct direct routes and capability counts", () => {
    expect(offline.counts.complete).toBe(151);
    expect(offline.tasks).toHaveLength(151);
    expect(new Set(offline.tasks.map((task) => task.path)).size).toBe(151);
    expect(EXPLORER_TOOLS).toHaveLength(28);
    expect(new Set(EXPLORER_IDS).size).toBe(28);
    expect(EXPLORER_TOOLS.every((tool) => tool.question && tool.limitation && tool.chains.length > 0)).toBe(true);
    expect(surfaces.totalTaskExperiences).toBe(offline.tasks.length + EXPLORER_TOOLS.filter((tool) => tool.id !== "batch-balances").length);
    expect(progress.completedTaskCount).toBe(surfaces.totalTaskExperiences);
    expect(surfaces.offlineToolbox.networkPolicy).toContain("connect-src 'none'");
    expect(surfaces.deployment).toBe("NOT_AUTHORIZED");
    expect(surfaces.publicRelease).toBe("NO_GO");
  });
  it("keeps all on-chain inspections in reviewed categories and separate routes", () => {
    const categories = surfaces.readOnlyExplorer.categories;
    for (const category of EXPLORER_CATEGORIES) {
      expect(EXPLORER_TOOLS.filter((tool) => tool.category === category && tool.id !== "batch-balances")).toHaveLength(categories[category]);
    }
    expect(EXPLORER_TOOLS.every((tool) => !offline.tasks.some((task) => task.path === `/inspect/${tool.id}/`))).toBe(true);
    for (const forbidden of ["swap", "perps", "wallet", "token-approvals", "taxlot-export"]) expect(EXPLORER_IDS).not.toContain(forbidden);
  });
});
