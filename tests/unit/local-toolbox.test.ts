import { describe, expect, it } from "vitest";
import { LOCAL_TASK_GROUPS, LOCAL_TOOL_IDS, LOCAL_TOOLS } from "../../src/lib/local-toolbox";
import { LOCAL_TOOL_DEFINITIONS, localToolById } from "../../src/lib/local-tool-definitions";
import { TOOLS, toolById } from "../../src/lib/tool-registry";
import { LOCAL_IDS, LOCAL_PAGES } from "../../scripts/release/local-toolbox-host.mjs";

describe("isolated local toolbox boundary", () => {
  it("publishes exactly the twenty reviewed local and wallet-free IDs", () => {
    expect(LOCAL_TOOL_IDS).toHaveLength(20);
    expect(LOCAL_IDS).toEqual(LOCAL_TOOL_IDS);
    expect(LOCAL_PAGES).toHaveLength(22);
    expect(new Set(LOCAL_TOOL_IDS).size).toBe(20);
    expect(LOCAL_TOOLS.map((tool) => tool.id)).toEqual(LOCAL_TOOL_IDS);
    expect(LOCAL_TOOLS.every((tool) => tool.executionMode === "local" && tool.walletRequirement === "none" && tool.networkRequirement === "none")).toBe(true);
    for (const id of ["swap", "perps", "wallet", "taxlot-export", "token-approvals"])
      expect(LOCAL_TOOL_IDS).not.toContain(id);
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
