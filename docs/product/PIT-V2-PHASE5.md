# PIT V2 Phase 5 local operations

## Product boundary

The existing 151 offline Toolbox tasks and 27 read-only Explorer inspections remain free and separate. The local Anvil operations build now has twelve functional routes: four Phase 2 ERC-20 workflows and eight Phase 5 modules. These route counts are not twelve independently audited contract engines. The Base Sepolia read-only and wallet-preview builds keep their original four routes; the latter has no transaction authority without a separately reviewed campaign. Neither package is a public deployment.

All Phase 5 writes target `127.0.0.1:8545` on chain 31337 and recheck the active account and chain before every send. A successful hash alone is insufficient: the UI waits for a successful receipt and reads the affected state. The automated browser wallet is a controlled EIP-1193 adapter connected to Anvil, **not MetaMask**. Manual MetaMask extension acceptance is deferred to PIT final pre-launch acceptance.

| Module | Actual local capability | PIT fee status | Important limit |
|---|---|---|---|
| Token Management | Inspect PIT token supply, cap, feature flags, pause, roles and delayed-admin state; authorized mint, own burn, pause and enabled role grants/revocations | 2–5 USDC proposed, inactive | Standard token has no mint; no default-admin transfer control |
| Allowance Manager | Inspect stated owner/token/spender, reduce or revoke allowance with owner wallet and readback | Free | No universal spender discovery; nonstandard approval semantics may fail |
| Batch Balance Checker | Bounded local Anvil ETH/ERC-20 reads, per-query errors, CSV import/export | Free | At most 50 wallets, 5 tokens, 4 concurrent reads; not a remote-network portfolio indexer |
| Native ETH MultiSender | Deploy local atomic sender and distribute exact value to 1–100 recipients | Variable fee proposed, inactive | External recipient call can revert entire batch; gas must fit conservative block bound |
| NFT Creator | Deploy capped owner-minted ERC-721; mint token #1 with explicit URI | Fixed fee proposed, inactive | PIT does not pin or guarantee metadata persistence |
| NFT Batch Sender | Deploy local sender; exact per-token approvals and atomic safe transfers for 1–50 IDs | Variable fee proposed, inactive | Existing blanket approval is recognized but never requested by PIT; unsupported NFT contracts may fail |
| Locker Manager | Import reviewed lock, inspect funding/unlock and release as immutable beneficiary | Free | Known contract address must be supplied |
| Vesting Manager | Import reviewed schedule, inspect allocation/vested/released/releasable and release as beneficiary | Free | Known contract address must be supplied; no revocation or late top-up |

Fees are metadata proposals. Deployment gas is shown separately when locally estimated; subsequent writes are estimated immediately before the wallet request and are not remote gas quotes. No PIT service fee, subscription, credit debit, USDC payment or merchant address is active in this build. The old billing and SIWE systems remain unchanged.

## Contracts and permissions

- `PitNativeMultiSender`: no owner or withdrawal role. It checks unique nonzero recipients, positive amounts and exact `msg.value` before making guarded calls. Any failed recipient reverts every transfer. Successful batches leave no normal user funds in the contract; unsolicited forced ETH has no recovery route.
- `PitNftCollection`: OpenZeppelin ERC-721 URI storage, Ownable and reentrancy guard. Constructor assigns the supplied creator as owner. Only the owner may mint sequential IDs from 1 to the immutable cap. URI values are immutable through the exposed interface, but external content may change or disappear. Ownership can be transferred by the owner; PIT has no reserved role.
- `PitNftBatchSender`: no owner or recovery role. It checks the caller's current ownership and per-token or pre-existing operator approval, then uses atomic `safeTransferFrom`. The frontend requests only exact per-token approvals.
- Existing PIT token, lock and vesting contracts are reused unchanged. Their on-chain custody and permission semantics remain those recorded in the Phase 3 security report.

The operations application is a local development candidate. It is not an independent external security audit and is not approved for mainnet funds. Chain 84532 deployment manifests and Phase 4 receipts remain historical testnet evidence; Phase 5 deploys none of these new contracts externally.

## Competitor capability gap

Public product pages for [CoinTool](https://ct.app/) list token creation, token distribution, balance checking and NFT utilities. [Bitbond Token Tool](https://tokentool.bitbond.com/) lists token creation, airdrops, lockers, vesting and NFT creation. They are product references, not implementation sources.

| Area | PIT before Phase 5 | Phase 5 local addition | Still missing |
|---|---|---|---|
| Token lifecycle | Creator, ERC-20 sender, lock, vest | Administration and claim managers | Remote wallet acceptance, supported-network rollout |
| Distribution | ERC-20 MultiSender | Native ETH and NFT batches | External-chain deployment and reviewed gas caps per network |
| NFTs | Read-only inspection | Capped collection creation and atomic batch sending | Metadata pinning, broader collection compatibility |
| Wallet risk | Selected approval inspection in Explorer | Stated-spender allowance reduction | Complete allowance enumeration without a verified indexer |
| Balance operations | Explorer single-purpose reads | Bounded batch local balance CSV | Public-network provider qualification and privacy disclosure |

PIT does not claim feature parity. It excludes sales, market-making bots, private-key import, hosted metadata storage and fee collection in this phase.

## Local acceptance commands

```bash
pnpm install --offline --frozen-lockfile
forge test --offline
pnpm exec vitest run tests/operations-phase5-inputs.test.ts
pnpm operations:check
pnpm exec playwright test --config playwright.operations-phase5.config.ts
pnpm operations:sepolia:check
pnpm operations:sepolia:wallet:check
CI=1 pnpm release:check
```

Playwright starts disposable Anvil accounts and performs actual local transactions. It does not automate a real wallet extension. The free Toolbox and Explorer artifact checks in `release:check` guard their route and network isolation. No command here deploys a Cloudflare/Vercel application or broadcasts to an external chain.
