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
  11155111: [
    "https://ethereum-sepolia-rpc.publicnode.com",
    sepolia.rpcUrls.default.http[0],
  ],
  1: ["https://ethereum-rpc.publicnode.com", mainnet.rpcUrls.default.http[0]],
  8453: ["https://base-rpc.publicnode.com", base.rpcUrls.default.http[0]],
  42161: [
    "https://arbitrum-one-rpc.publicnode.com",
    arbitrum.rpcUrls.default.http[0],
  ],
};
export function assertTradingChain(id: number) {
  if (!chains.some((c) => c.id === id)) throw new Error("Unsupported chain");
  if (id !== sepolia.id && !(config.FEES_ENABLED && config.MAINNET_ENABLED))
    throw new Error("Mainnet trading is disabled");
}
export function countryBlocked(country: string) {
  return config.blockedCountries.includes(country.trim().toUpperCase());
}
