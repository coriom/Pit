# Assumptions and acceptance gaps

- The local TAXLOT repo was populated during this task. Its real schema is now copied byte-for-byte; see schemas/PROVENANCE.md for its source hash and mapping limitations.
- No `.env.local`, funded wallet, or browser wallet is supplied. Live Sepolia swaps and Hyperliquid testnet orders cannot be claimed as executed. Automated browser evidence demonstrates UI only.
- Private keys are never accepted by application code or exposed through Vite environment variables. Live E2E uses an externally unlocked injected test wallet; `.env.local` may specify public test account and amounts only. This resolves the conflict between “no private keys anywhere” and an env-funded wallet.
- Fees are compile-time disabled by default; recipient addresses remain unset until configured. Mainnet requires a separate explicit flag in addition to FEES_ENABLED.
- No WalletConnect project ID is available (and no client API keys are allowed). ConnectKit uses injected wallets only.
- ERC20 swaps only in v1; native ETH must first be wrapped externally. Exact-amount approval is requested before signing an order.
- The client-side country helper is a non-enforcing stub, with US as an illustrative list entry. It does not look up location or provide authoritative geoblocking.
- Stablecoins are crypto: crypto-to-stablecoin is a trade. Only a real fiat off-ramp is a disposal. Perpetual fills are derivative records, not fabricated spot acquisitions; the schema has no derivative type, so marked records export separately for review.
- No external deployment, pinning, or ENS transaction occurs automatically. Scripts produce an artifact and document manual publication.
