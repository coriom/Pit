export const tools = [
  {slug:"events",name:"Event History Explorer",detail:"Scan a bounded contract log history with coverage and exports.",category:"Explorer"},
  {slug:"permissions",name:"Contract Permissions",detail:"Inspect recognized owners, roles, and proxy controls.",category:"Control"},
  {slug:"distribution",name:"Distribution Verifier",detail:"Compare expected ERC-20 recipients with confirmed transfers.",category:"Verification"},
  {slug:"nft",name:"NFT Metadata Integrity",detail:"Check token metadata and media availability on a local, isolated backend.",category:"NFT"},
  {slug:"monitor",name:"Contract Monitor",detail:"Track confirmed contract events and inspect durable alerts.",category:"Monitoring"},
] as const;
export type ToolKind = typeof tools[number]["slug"];
