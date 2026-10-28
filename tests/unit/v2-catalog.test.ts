import { describe, expect, it } from "vitest";
import { LOCAL_TASK_INVENTORY } from "../../src/lib/local-task-registry";
import { LOCAL_TOOLS } from "../../src/lib/local-toolbox";
import { EXPLORER_TOOLS } from "../../src/lib/explorer-registry";
import { PLANNED_OPERATIONS, V2_CATEGORIES } from "../../src/lib/v2-catalog-core";
import { V2_LOCAL_TASKS, V2_LOCAL_WORKSPACES } from "../../src/lib/v2-local-catalog";
import { V2_EXPLORER_TASKS } from "../../src/lib/v2-explorer-catalog";

describe("PIT V2 catalogue adapters", () => {
  it("keeps the original 151 local and 27 Explorer experiences on their routes and adds the batch read", () => {
    expect(V2_LOCAL_TASKS).toHaveLength(151);
    expect(V2_EXPLORER_TASKS).toHaveLength(28);
    expect(V2_LOCAL_WORKSPACES).toHaveLength(20);
    expect(V2_LOCAL_TASKS.map((entry) => entry.path)).toEqual(LOCAL_TASK_INVENTORY.map((entry) => entry.path));
    expect(V2_EXPLORER_TASKS.map((entry) => entry.path)).toEqual(EXPLORER_TOOLS.map((entry) => `/inspect/${entry.id}/`));
    expect(V2_LOCAL_WORKSPACES.map((entry) => entry.path)).toEqual(LOCAL_TOOLS.map((entry) => entry.path));
    expect(new Set([...V2_LOCAL_TASKS, ...V2_EXPLORER_TASKS].map((entry) => `${entry.execution}:${entry.path}`)).size).toBe(179);
  });

  it("maps every working experience to one of nine user categories and keeps it free", () => {
    expect(V2_CATEGORIES).toHaveLength(9);
    const categoryIds = new Set(V2_CATEGORIES.map((entry) => entry.id));
    expect(V2_CATEGORIES.reduce((sum, category) => sum + V2_LOCAL_TASKS.filter((entry) => entry.category === category.id).length, 0)).toBe(151);
    expect(V2_CATEGORIES.reduce((sum, category) => sum + V2_EXPLORER_TASKS.filter((entry) => entry.category === category.id).length, 0)).toBe(28);
    for (const entry of [...V2_LOCAL_TASKS, ...V2_EXPLORER_TASKS]) {
      expect(categoryIds.has(entry.category)).toBe(true);
      expect(entry.availability).toBe("available");
      expect(entry.pricing).toBe("free");
      expect(entry.walletRequired).toBe(false);
      expect(entry.path).toMatch(/^\/(tasks|tools|inspect)\/[^/]+\/$/);
      expect(entry.risk.length).toBeGreaterThan(15);
    }
    expect(V2_LOCAL_TASKS.every((entry) => entry.execution === "local" && entry.networks.length === 0)).toBe(true);
    expect(V2_EXPLORER_TASKS.every((entry) => entry.execution === "read-only blockchain" && entry.networks.length > 0)).toBe(true);
  });

  it("keeps seven indicative paid operations non-routable and non-executable", () => {
    expect(PLANNED_OPERATIONS).toHaveLength(7);
    for (const entry of PLANNED_OPERATIONS) {
      expect(entry.availability).toBe("planned");
      expect(entry.execution).toBe("planned");
      expect(entry.path).toBeUndefined();
      expect(entry.indicativeFee).toContain("USDC");
      expect(entry.feeModel).toMatchObject({ gas: "separate estimate", total: "not quoted", status: "proposal only" });
      expect([...V2_LOCAL_TASKS, ...V2_EXPLORER_TASKS].some((working) => working.id === entry.id)).toBe(false);
    }
    expect(PLANNED_OPERATIONS.filter((entry) => entry.localMvpPath)).toHaveLength(5);
    expect(PLANNED_OPERATIONS.every((entry) => entry.path === undefined)).toBe(true);
  });
});
