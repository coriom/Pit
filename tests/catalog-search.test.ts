import { describe, expect, it } from "vitest";
import { catalogSearchScore, normalizeSearchText, rankCatalogSearch } from "../src/operations/lib/catalog-search";

const tools = [
  { title: "Risk Management Calculator", description: "Estimate position risk", category: "Trading & Risk" },
  { title: "ERC-20 Token Creator", description: "Create a fixed-supply token", category: "Token Creator" },
  { title: "Batch Balance Checker", description: "Read address balances", category: "Blockchain Explorer" },
  { title: "Wallet Allowance Manager", description: "Inspect approvals for an account", category: "Token Management" },
  { title: "ERC-721 NFT Creator", description: "Create a collection", category: "Token Creator" },
];
const resultTitles = (query: string) => rankCatalogSearch(tools, query).map(({ item }) => item.title);

describe("catalog search", () => {
  it("normalizes case, accents, ERC hyphens, whitespace and plurals", () => {
    expect(normalizeSearchText("  ÉRC-20   Créator ")).toBe("erc20 creator");
    expect(resultTitles("ERC20 creator")[0]).toBe("ERC-20 Token Creator");
    expect(resultTitles("ERC-20 CREATOR")[0]).toBe("ERC-20 Token Creator");
    expect(resultTitles("wallet balances")).toContain("Batch Balance Checker");
  });
  it("finds multiword requests across title, description and category", () => {
    expect(resultTitles("risk calculator")[0]).toBe("Risk Management Calculator");
    expect(resultTitles("wallet balance")).toContain("Batch Balance Checker");
    expect(resultTitles("address holdings")).toContain("Batch Balance Checker");
    expect(resultTitles("nft creator")).toContain("ERC-721 NFT Creator");
    expect(resultTitles("erc-1155 creator")).not.toContain("ERC-721 NFT Creator");
    expect(resultTitles("token generation")).toContain("ERC-20 Token Creator");
  });
  it("ranks exact titles first and breaks ties by catalog order", () => {
    expect(resultTitles("ERC-20 Token Creator")[0]).toBe("ERC-20 Token Creator");
    const equal = [{ title: "Alpha", description: "Risk", category: "Tools" }, { title: "Beta", description: "Risk", category: "Tools" }];
    expect(rankCatalogSearch(equal, "risk").map(({ item }) => item.title)).toEqual(["Alpha", "Beta"]);
  });
  it("returns no matches for empty and impossible queries", () => {
    expect(resultTitles("")).toEqual([]);
    expect(resultTitles("quasar impossible")).toEqual([]);
    expect(catalogSearchScore(tools[0], "risk impossible")).toBe(0);
  });
  it("supports category filtering after ranking", () => {
    const matches = rankCatalogSearch(tools, "creator").filter(({ item }) => item.category === "Token Creator");
    expect(matches.map(({ item }) => item.title)).toEqual(["ERC-20 Token Creator", "ERC-721 NFT Creator"]);
  });
});
