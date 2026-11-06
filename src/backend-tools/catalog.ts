export const BACKEND_TOOLS = [
  { id: "event-history", title: "Event History Explorer", category: "blockchain-explorer", description: "Scan a bounded contract event history with coverage and exports.", kind: "events" },
  { id: "contract-permissions", title: "Contract Permissions & Control", category: "token-management", description: "Review recognized owners, roles and proxy controls with evidence limits.", kind: "permissions" },
  { id: "distribution-verifier", title: "ERC-20 Distribution Verifier", category: "transfers-airdrops", description: "Compare a recipient CSV with confirmed Transfer logs and balance evidence.", kind: "distribution" },
  { id: "nft-metadata-checker", title: "NFT Metadata Integrity", category: "developer-tools", description: "Check token metadata and media availability through a bounded scan.", kind: "nft" },
  { id: "contract-monitor", title: "Contract Monitor & Alerts", category: "blockchain-explorer", description: "Watch supported events and keep a temporary alert inbox.", kind: "monitor" },
] as const;
export function backendEnabled() { return process.env.PIT_BACKEND_ENABLED === "1" && process.env.PIT_HOSTED_STAGING !== "1"; }
