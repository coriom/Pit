import {
  WagmiProvider,
  createConfig,
  useAccount,
  useSwitchChain,
  useWalletClient,
  useDisconnect,
} from "wagmi";
import { injected } from "wagmi/connectors";
import {
  http,
  fallback,
  type Transport,
  formatEther,
  createPublicClient,
  custom,
} from "viem";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConnectKitProvider, ConnectKitButton } from "connectkit";
import { sepolia } from "viem/chains";
import { useEffect, useState, type ReactNode } from "react";
import { publicRpc } from "../lib/config";
// The release connector only mounts Sepolia. Keeping dormant mainnet chain
// transports in wagmi caused background RPC attempts despite execution gates.
const chains = [sepolia] as const;
const walletConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: Object.fromEntries(
    chains.map((c) => [
      c.id,
      fallback(publicRpc[c.id].map((url) => http(url))),
    ]),
  ) as Record<(typeof chains)[number]["id"], Transport>,
  ssr: true,
});
const query = new QueryClient();
export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={walletConfig}>
      <QueryClientProvider client={query}>
        <ConnectKitProvider
          options={{ hideBalance: true, embedGoogleFonts: false }}
        >
          {children}
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
export function Wallet() {
  const { address, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { data: wallet } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const [balance, setBalance] = useState("");
  useEffect(() => {
    setBalance("");
    let active = true;
    if (wallet && address)
      createPublicClient({ transport: custom({ request: wallet.request }) })
        .getBalance({ address })
        .then((v) => {
          if (active) setBalance(formatEther(BigInt(v)));
        })
        .catch(() => {
          if (active) setBalance("unavailable");
        });
    return () => {
      active = false;
    };
  }, [wallet, address, chainId]);
  return (
    <div className="wallet">
      <select
        aria-label="Wallet network"
        value={chainId ?? 11155111}
        onChange={(e) =>
          switchChain({ chainId: Number(e.target.value) as 11155111 })
        }
      >
        {chains.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {address ? (
        <button
          type="button"
          onClick={() => disconnect()}
          aria-label="Disconnect wallet"
        >
          {`${address.slice(0, 6)}…${address.slice(-4)}`} · Disconnect
        </button>
      ) : (
        <ConnectKitButton showAvatar={false} />
      )}
      {address && <small>{balance} ETH · wallet RPC</small>}
    </div>
  );
}
