/** Small, deterministic search over the existing catalog metadata. No network or second registry. */
export type CatalogSearchItem = {
  title: string;
  description: string;
  category: string;
  tags?: string;
};

const aliases: Record<string, readonly string[]> = {
  wallet: ["address", "account"], address: ["wallet"], account: ["wallet"],
  balance: ["holding"], holding: ["balance"],
  creator: ["create", "generation", "generator"], create: ["creator", "generation", "generator"],
  generation: ["creator", "create", "generator"], generator: ["creator", "create"],
  airdrop: ["distribution", "multisender"], distribution: ["airdrop", "multisender"], multisender: ["distribution", "airdrop"],
  // Generic NFT searches may include both standards; a named standard must
  // never pull in the other one merely through the word "NFT".
  nft: ["erc721", "erc1155"],
  inspect: ["inspection", "explorer"], inspection: ["inspect", "explorer"], explorer: ["inspect", "inspection"],
};
const plural: Record<string, string> = {
  balances: "balance", wallets: "wallet", addresses: "address", accounts: "account",
  holdings: "holding", calculators: "calculator", creators: "creator", tokens: "token",
  inspections: "inspection", transfers: "transfer", risks: "risk", fees: "fee",
};

export function normalizeSearchText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\berc[\s-]*(20|721|1155)\b/g, "erc$1")
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
export function searchTokens(value: string): string[] {
  return normalizeSearchText(value).split(" ").filter(Boolean).map((word) => plural[word] ?? word);
}
function tokenScore(term: string, fields: readonly (readonly string[])[]): number {
  const candidates = [term, ...(aliases[term] ?? [])];
  const weights = [12, 5, 2, 1];
  let best = 0;
  for (let field = 0; field < fields.length; field++) {
    for (const candidate of candidates) {
      if (fields[field].includes(candidate)) best = Math.max(best, weights[field] - (candidate === term ? 0 : 1));
    }
  }
  return best;
}
export function catalogSearchScore(item: CatalogSearchItem, query: string): number {
  const terms = searchTokens(query);
  if (!terms.length) return 0;
  const fields = [searchTokens(item.title), searchTokens(item.category), searchTokens(item.description), searchTokens(item.tags ?? "")];
  let score = 0;
  for (const term of terms) {
    const matched = tokenScore(term, fields);
    if (!matched) return 0;
    score += matched;
  }
  const phrase = terms.join(" ");
  const title = fields[0].join(" ");
  if (title === phrase) score += 100;
  else if (title.includes(phrase)) score += 24;
  else if (fields[1].join(" ").includes(phrase)) score += 8;
  return score;
}
export function rankCatalogSearch<T extends CatalogSearchItem>(items: readonly T[], query: string): { item: T; score: number; index: number }[] {
  return items.map((item, index) => ({ item, score: catalogSearchScore(item, query), index }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}
