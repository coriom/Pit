# Verification — 2026-09-29

## Acceptance status

- Implemented phases A–E in five phase commits; see `git log --oneline --reverse` for the exact history.
- `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, no configured recipients, no agent sessions.
- `pnpm check`: no TypeScript/Astro errors or warnings.
- `pnpm test`: 11 tests pass, covering CoW SDK appData and exact cost reference values, fee caps/conversions, schema provenance, invalid event rejection, concurrent duplicate writes, CSV escaping/precision, and derivative review mapping.
- `pnpm test:e2e`: four production-browser tests pass. They cover hydration/CSP, legal navigation, wallet dialog, mobile layout, a keyless injected-wallet fixture, rejection before signing, IndexedDB-to-CSV download, and IPFS-style subpath hydration/navigation.
- The Hyperliquid market list was also read from the live public testnet info API in the development browser. This is read-only evidence, not an order execution.
- Two consecutive builds are compared byte-for-byte via their complete manifests. The release hash is listed below.

## Funded execution remains blocked

No `.env.local` or funded browser wallet was supplied. Running `node scripts/live-e2e.mjs` exited with code 2 and listed missing public account/token/amount/CDP parameters. **No Sepolia swap or Hyperliquid testnet order was submitted or filled in this session.** No transaction hash, order UID, or live-fill screenshot is claimed.

The live harness reads only public parameters from ignored `.env.local` and attaches to an external wallet browser. It never reads private keys, funds wallets, or approves extension dialogs. Supply a funded Sepolia ERC20 balance plus approval gas and a funded Hyperliquid testnet account, then follow README instructions. It waits for the specific submitted CoW order to become fulfilled. Hyperliquid order acceptance is separate from a fill; reconcile actual IDs and local CSV before marking live acceptance complete.

No Cloudflare deployment, external IPFS publication, or ENS update was performed. Deployment is documented and manual.

## Screenshots

- `dev-swap.png`: actual `pnpm dev` swap screen, disconnected.
- `dev-perps.png`: actual `pnpm dev` perps screen with live public testnet markets, disconnected.
- `production-wallet.png`: production ConnectKit dialog; UI evidence only.
- `mobile-perps-fixture.png`: mobile production layout, with **mocked public market metadata** and no wallet or order.

These images do not represent funded trades. Automated wallet tests use a synthetic public address and reject all signing requests.

## Limits worth preserving

- The exact Taxlot schema snapshot is committed with its SHA-256 in `schemas/PROVENANCE.md`. It has no derivative type; perps evidence is explicitly marked and exports separately. It is not a ready-to-use derivative tax calculation.
- Record capture depends on a connected browser, selected CoW chain, available protocol history, and browser storage. Sync errors are visible. Historical retention and offline gaps require reconciliation.
- Script CSP disallows unsafe-inline and unsafe-eval. Dynamic ConnectKit CSS requires `style-src 'unsafe-inline'`; this exception is documented. No CDN assets are used.
- The build includes relatively large wallet/protocol SDK chunks. Mainnet trading and fee activation still need funded integration acceptance and the legal opinion placeholder completed.

## Reproduced release artifact

Node `22.22.3`, pnpm `10.17.1`. Two consecutive final builds produced the same complete manifest and aggregate SHA-256:

```text
fa712013bdc5279ae30e617ae8e75c731b0bf446dcb09648bef8f2ffb1453216
```

A–D commits: `4a3084f`, `b7fb676`, `3bf7b19`, `a3d367d`. Phase E is the commit containing this verification record; retrieve its full hash with `git log -1 --format=%H` on this release.
