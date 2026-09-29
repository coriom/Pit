# PIT

Static, non-custodial trading UI: Astro + React islands + TypeScript + Tailwind, wagmi/viem/ConnectKit, CoW SDK, Hyperliquid SDK, IndexedDB, Vitest and Playwright. MIT licensed. No backend, app API keys, private-key input, or address analytics.

**Testnet preview, not launch-ready. `FEES_ENABLED=false`. No funded trade execution has been verified.**

## Run

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev --port 4397
```

Use Node 22.22.3 and pnpm 10.17.1 (lockfile committed). Open `http://127.0.0.1:4397`. Connect an injected browser wallet. WalletConnect is deliberately unconfigured because it requires a project ID. Browser balances and ERC20 metadata use the connected wallet's RPC; the public RPC allowlist is in `src/lib/config.ts`.

## Trading

- **CoW:** select Sepolia, enter two ERC20 contract addresses and a funded sell amount. Get quote → inspect exact SDK amounts/costs and appData → approve only the sell amount → sign and submit. Quotes expire in the UI after 60 seconds and invalidate on input/account/chain change. Approval consumes gas separately. Orders poll every 15 seconds. Wrap native ETH externally before use.
- **Hyperliquid:** select Perpetuals. Public testnet metadata populates markets. Set side, limit price, size, and optional reduce-only; review and sign with the main wallet. The protocol uses its own testnet irrespective of the wallet's selected EVM chain. No agent keys. Positions, open orders, fills, and 30 days of funding are available below the form.
- **Fees:** CoW omits partnerFee and Hyperliquid omits builder entirely while disabled. When enabled, CoW uses `appCode=PIT` and 20 bps; Hyperliquid defaults to 10 tenths of a bp (1 bp = 0.01%). Builder approval uses EIP-712 on the main wallet, then the order sends `{b,f}`. Invalid recipients/caps fail closed. Mainnet CoW also requires `MAINNET_ENABLED`; Hyperliquid remains explicitly testnet in this release.

Configuration is source-controlled in `src/lib/config.ts`. Recipient/builder addresses are intentionally unset. The country list is only a non-authoritative stub. Complete the pending legal review before deploying a public mainnet interface.

## Local records and Taxlot

Filled executions, never quotes or mere submissions, produce records. The background recorder runs across tabs while a wallet is connected. CoW syncs the selected chain's paginated trade history. Hyperliquid uses a persisted timestamp cursor with overlapping boundaries. Every normalized CoW event write validates against the **copied Taxlot schema**, then atomically deduplicates and assigns a sequence. Hyperliquid fills and recent funding instead enter a separate append-only raw-evidence database, without Taxlot validation or normalization.

“Export for Taxlot” exports the connected account's spot records. “Perps review CSV” is disabled: derivative accounting is `unsupported_derivative_v1`; Hyperliquid fills/funding are retained only as raw protocol evidence, without Taxlot events. CSV preserves decimal strings and escapes spreadsheet formulas. All captured records remain local to this browser origin; a new deployment origin or clearing storage loses access to them. Export regularly. Offline browser time and protocol history-retention limits can leave gaps; inspect sync errors and reconcile exports with protocol history. Selecting another chain is required to backfill its CoW fills.

See [schema provenance and Generic importer mapping](schemas/PROVENANCE.md). Stablecoins are crypto: **crypto → stablecoin is trade**; only fiat off-ramps are disposals. There is no fiat off-ramp in PIT. The actual Taxlot schema has no derivative event type: [Phase I establishes the compatibility boundary](docs/audit/phase-i/DERIVATIVE-ACCOUNTING.md); raw derivative evidence is not normalized into a spot `trade` or exported as a Taxlot event. No EUR values are invented.

## Verification

```sh
pnpm check
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Browser tests run the production artifact on port 4398 and cover hydration, CSP, wallet connection with a keyless mock provider, invalid-input signing prevention, mobile layout, and IPFS subpath navigation. Public API fixtures in tests are labeled; they do not prove real execution. Screenshots and the acceptance status are in [docs/VERIFICATION.md](docs/VERIFICATION.md).

Live harness: provide only the public parameters listed in `.env.example` through the invoking shell environment; no environment file is loaded automatically. Attach an already-running loopback debug browser with an externally controlled funded testnet wallet using `PIT_LIVE_CDP_URL`, start `pnpm dev --port 4397`, then run `node scripts/live-e2e.mjs`. The observer never clicks a trade/signature button. The operator inspects the quote and approves each wallet prompt manually. It captures sanitized submitted actions and responses, blocks duplicate order submissions and nonzero PIT fee fields, and never labels submission as settlement. Never put a private key, seed or API secret into PIT. Missing parameters exit with an explicit blocker. See [Phase H operator procedure and blockers](docs/audit/phase-h/LIVE-TESTNET.md).

## Reproducible artifact

`pnpm build` regenerates the AJV standalone validator, builds static HTML/JS/CSS, makes HTML asset paths relative for IPFS, and writes `dist/build-manifest.json`. The manifest hashes every artifact except itself, sorts relative paths, then hashes the JSON array of `[path, sha256]` entries. There are no timestamps in the digest. Use the same source, lockfile, Node and pnpm versions; build twice and compare the manifest `hash`. The verified release hash is recorded in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Trust and deployment

Production has a deny-by-default CSP, hashed Astro scripts, a protocol/RPC connect allowlist, no unsafe-eval, and no remote fonts/scripts/images or CDN assets. Since there are no CDN assets, no CDN SRI exceptions are needed. ConnectKit injects CSS, so **style-src permits unsafe-inline**; scripts do not. Cloudflare adds frame denial, no-referrer, nosniff and restricted browser permissions through `_headers`. IPFS gateways may ignore those HTTP headers; the HTML CSP remains. CSP is not enforced by Astro's dev server; use the production tests.

`scripts/deploy.sh build` only creates a reviewable artifact. Publication is manual: see [docs/DEPLOY.md](docs/DEPLOY.md). No Cloudflare upload, external IPFS pin, or ENS transaction was performed. The scripts contain no signing keys.

Protocol reference: [CoW SDK integration](https://docs.cow.fi/cow-protocol/integrate/sdk), [Hyperliquid SDK](https://github.com/nktkas/hyperliquid), [builder approval](https://nktkas.gitbook.io/hyperliquid/api-reference/exchange-methods/approvebuilderfee).

## Testnet release candidate

Run `pnpm release:check` from a clean tree. It verifies pinned fee/network/schema/origin configuration, scans tracked files for credential patterns, and requires unit tests, typecheck, production build and offline Playwright tests to pass. It rejects environment-file and alternate-browser-target overrides; there is no force mode.

CoW requires **Ethereum Sepolia (11155111), not Base Sepolia (84532)**. Hyperliquid uses its independently checked testnet API. Both require a connected external wallet and writable accounting storage; every signing action rechecks the shared preflight. See the [operator runbook](docs/audit/phase-j/TESTNET-RUNBOOK.md) and [release safety evidence](docs/audit/phase-j/RELEASE-SAFETY.md). A release pass does not establish live acceptance. Assumption 8 remains OPEN.
