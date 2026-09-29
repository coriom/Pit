import { WagmiProvider, createConfig, useAccount, useSwitchChain, useWalletClient } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { http, formatEther, createPublicClient, custom } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider, ConnectKitButton } from 'connectkit';
import { useEffect, useState, type ReactNode } from 'react';
import { chains, publicRpc } from '../lib/config';
const walletConfig = createConfig({ chains, connectors: [injected()], transports: Object.fromEntries(chains.map(c => [c.id, http(publicRpc[c.id][0])])) as any, ssr: true });
const query = new QueryClient();
export function Providers({ children }: { children: ReactNode }) { return <WagmiProvider config={walletConfig}><QueryClientProvider client={query}><ConnectKitProvider>{children}</ConnectKitProvider></QueryClientProvider></WagmiProvider>; }
export function Wallet() {
  const { address, chainId } = useAccount(); const { data: wallet } = useWalletClient(); const { switchChain } = useSwitchChain();
  const [balance, setBalance] = useState('');
  useEffect(() => { setBalance(''); let active = true; if (wallet && address) createPublicClient({transport:custom({request:wallet.request})}).getBalance({address}).then(v => { if (active) setBalance(formatEther(BigInt(v))); }).catch(() => { if (active) setBalance('unavailable'); }); return () => { active = false; }; }, [wallet, address, chainId]);
  return <div className="wallet"><select aria-label="Wallet network" value={chainId ?? 11155111} onChange={e => switchChain({ chainId: Number(e.target.value) as 11155111 })}>{chains.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ConnectKitButton />{address && <small>{balance} ETH · wallet RPC</small>}</div>;
}
