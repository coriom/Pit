# PIT V2 Phase 6 — local product boundary

## Implemented in source

- **Public batch balances** (`/inspect/batch-balances/`): Ethereum, Base and Base Sepolia, fixed HTTPS RPC endpoints, 1–25 explicit wallets, 0–3 ERC-20 contracts, 0–2 ERC-721 contracts and 0–2 ERC-1155 `(collection,id)` pairs. Reads share one sampled block per run. Four concurrent reads, bounded retries, 30-second deadline and explicit `UNAVAILABLE` rows. Address CSV import and result CSV export. No NFT enumeration, holder discovery or PIT data upload. The existing local Anvil balance route remains available separately.
- **ERC-721 manager** (`/operations/nft-manager/`): inspect a specified NFT, approval and URI; reviewed PIT collection owner can mint, holder can approve, revoke or safe-transfer one token. Existing PIT ERC-721 bytecode has no burn, pause or mutable metadata; those controls are absent. Remote metadata JSON is fetched only after an explicit click, with HTTPS, CORS, content type, size and timeout checks. The remote host sees that request; no HTML or media is rendered.
- **ERC-1155 creator and manager** (`/operations/erc1155-creator/`, `/operations/erc1155-manager/`): owner-only ID definition and capped minting; holder/approved-operator burning; token transfer and collection-wide operator approval. The URI template is set at collection creation. Third-party contracts are inspect-only; writes require reviewed PIT runtime bytecode.
- **ERC-1155 MultiSender** (`/operations/erc1155-multisender/`): 1–40 atomic transfers with a reviewed helper. It requires an explicitly disclosed **collection-wide** `setApprovalForAll`; the management route can revoke it. The helper has no custody or recovery function. A 40-recipient local Foundry case measured 1,832,627 gas for `send`; this is not a live network quote.
- **NFT Metadata Studio** (`/operations/metadata-studio/`): local JSON validation or bounded CSV conversion to individual ERC-721/1155 JSON files in a portable tar archive. PIT neither hosts nor pins metadata.
- **Airdrop Composer** (`/operations/airdrop-composer/`): exact integer allocation by equal, explicit raw units, weights or basis points, deterministic dust assignment and local per-batch CSV tar export for the existing ERC-20 MultiSender. Imported snapshots are user supplied; the composer does not discover holders or execute automatically.
- **Indicative fee quotes**: typed USDC micro-unit price configuration, separate ETH gas field, no cross-asset total or payment action. All fees remain inactive.

## Architecture and permission model

The 151 browser-local Toolbox experiences keep `connect-src 'none'` and no JavaScript chunks. The Explorer has 28 read-only task routes (27 original, one public batch route) and fixed Ethereum/Base/Base Sepolia RPC endpoints. The local operations build has 18 routes (12 original, six added) and is restricted to loopback Anvil chain 31337 for writes. The prior Base Sepolia deployments, receipts, read-only preview and separate SIWE worker are unchanged. `https:` in the **local operations** CSP permits the explicitly requested client-side NFT metadata fetch; the Toolbox and Explorer retain their separate, stricter CSPs. This local CSP must be reviewed before any public operations hosting.

`Pit1155Collection` assigns `Ownable.owner()` to the connected creator. That owner defines IDs and caps, mints within caps and may transfer ownership. Holders may burn their own units; approved collection-wide operators can also burn under OpenZeppelin ERC-1155 Burnable semantics. PIT has no role. `Pit1155BatchSender` transfers from `msg.sender` only after standard collection-wide approval and leaves no balance on successful transfers. Receiver failure reverts the batch. Nonstandard or malicious ERC-1155 contracts are not accepted for local writes by the browser interface. No independent security audit has been performed.

## Commercial status

The proposed 49/149 USDC ERC-20 creation, 3 + 0.10/address capped at 49 USDC distribution, 39 USDC locker and 79 USDC vesting prices remain indicative. ERC-1155 creation proposes 79 USDC; ERC-1155 batch distribution proposes 3 + 0.10/row capped at 49 USDC. Free inspection, metadata preparation and allocation preparation remain free. Gas is denominated separately in ETH. There is no payment address, fee-collecting contract, checkout, enforceable server-side quote, subscription requirement or USDC transfer in this build. Before monetization, choose and independently review an atomic service-fee mechanism or verified prepayment with replay protection, exact chain/asset/order scope, expiry, settlement and refund handling.

## Capability comparison, with scope

| Capability | Public reference | PIT Phase 6 | Remaining gap |
|---|---|---|---|
| Multi-network batch balances | [CoinTool batch balance checker](https://ct.app/batchCheckBalance/linea) | Read-only Ethereum/Base/Base Sepolia, explicitly listed assets | No indexer, universal token discovery or broad chain list |
| ERC-721/1155 batch NFT sending | [CoinTool NFT MultiSender](https://ct.app/nft/multiSender/ink) | ERC-721 and ERC-1155 locally tested on Anvil | No remote writes or production wallet acceptance |
| NFT lifecycle and metadata | [Token Tool NFT management](https://tokentool.bitbond.com/managenft) | Conservative local creator/manager and local metadata archive | No PIT pinning, public mint sale, whitelist or mutable ERC-721 preset |
| ERC-20 distribution and vesting | [Token Tool token multisender](https://tokentool.bitbond.com/token-multisender/bsc), [vesting](https://tokentool.bitbond.com/create-token-vesting-collection/arbitrum) | PIT local MultiSender, airdrop composer, lock and vesting | No paid service, testnet Phase 6 contracts or remote execution |

These are feature references, not parity claims. Public RPCs can observe queried addresses. Future blockchain transactions, if separately enabled, will be public on-chain.

## Acceptance boundary

The Solidity contracts and operations frontend are **locally implemented and locally tested** only. Browser EIP-1193 tests forward to deterministic Anvil accounts, verify real local receipts and read contract state. They are not genuine MetaMask extension acceptance. No Phase 6 contract was deployed to Base Sepolia or mainnet. No Sourcify submission occurred. Manual MetaMask extension acceptance deferred until final pre-launch validation.
