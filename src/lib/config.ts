import { arbitrum, base, mainnet, sepolia } from "viem/chains";
export const config = Object.freeze({
  FEES_ENABLED: false as boolean,
  MAINNET_ENABLED: false as boolean,
  feeRecipient: "" as string,
  cowAppCode: "PIT",
  partnerFeeBps: 20,
  builderAddress: "" as string,
  builderFeeTenthsBps: 10,
  agentSessions: false,
  blockedCountries: ["US"],
});
export const chains = [sepolia, mainnet, base, arbitrum] as const;
export const publicRpc = {
  11155111: ["https://ethereum-sepolia-rpc.publicnode.com"],
  1: ["https://ethereum-rpc.publicnode.com"],
  8453: ["https://base-rpc.publicnode.com"],
  42161: ["https://arbitrum-one-rpc.publicnode.com"],
};
export function assertTradingChain(id: number) {
  if (!chains.some((c) => c.id === id)) throw new Error("Unsupported chain");
  if (id !== sepolia.id && !(config.FEES_ENABLED && config.MAINNET_ENABLED))
    throw new Error("Mainnet trading is disabled");
}
export function countryBlocked(country: string) {
  return config.blockedCountries.includes(country.trim().toUpperCase());
}
