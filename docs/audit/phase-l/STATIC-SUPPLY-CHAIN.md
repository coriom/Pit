# Phase L — static supply chain and browser request audit

This is an offline testnet build audit. No public origin, real wallet, signature, order, swap or deployment was used. `FEES_ENABLED=false` and the Phase J execution gate remain unchanged.

## Runtime inventory and SRI

Command: `pnpm build`, then `node scripts/release/artifacts.mjs`. The generated `dist` inventory is **123 files, 3,178,667 bytes**: 117 JavaScript chunks, 3 HTML pages, 1 CSS file, 1 JSON manifest and `_headers`. The [complete deterministic manifest](artifact-inventory.json) lists the path and SHA-256 of all 122 content artifacts; the manifest is the 123rd file. The final build is checked again by `pnpm release:check`. No font, image, source-map, external script or external stylesheet artifact was found. The generated HTML uses one same-origin CSS link, same-origin Astro island entrypoints and seven Astro-generated inline script hashes. JS chunks use relative, same-origin imports. Inline Astro boot scripts are protected by the `script-src` hashes.

| Resource/request | Classification | Source and control |
| --- | --- | --- |
| HTML, CSS, Astro island JS and its dynamic chunks | Same-origin generated assets | `dist/`; no CDN script or stylesheet. CSP `script-src 'self'` plus hashes and `style-src 'self'`. |
| Icons/images | Bundled React/SVG components; no browser image request in the exercised flows | `img-src 'self'`; remote images rejected. |
| Fonts | System font stack; ConnectKit `embedGoogleFonts:false` | No `@font-face`, CSS `@import`, external font request or font artifact. `font-src 'self'`. |
| Sepolia chain RPC | Public third-party runtime fallback | `ethereum-sepolia-rpc.publicnode.com`, `11155111.rpc.thirdweb.com`. The injected wallet provider handles account balance; the fallback URLs contain no credential. |
| CoW orderbook and trades | Required third-party runtime API | `https://api.cow.fi/sepolia/...`; account address is sent for order history/fill reads. |
| Hyperliquid info | Required third-party runtime API | `https://api.hyperliquid-testnet.xyz/info`; account/market data is sent as protocol requires. Exact testnet API and RPC origins are release-gated. |
| Injected wallet | External user-controlled provider, outside PIT's HTTP resources | `eth_accounts`, `eth_requestAccounts`, `eth_chainId`, `eth_getBalance`; wallet signatures remain operator-controlled. |
| WalletConnect/Reown or vendor links in transitive bundle | Dormant dependency code/string literals | PIT mounts `injected()` only and has no WalletConnect project ID. Browser capture shows no request to these hosts. CSP does not allow them. Vendor telemetry implementation is present in the transitive ConnectKit bundle but has no exercised request path; this is a bounded finding, not a claim that the dependency contains no telemetry code. |
| Analytics/session replay/fingerprinting | Removable/not configured | No PIT analytics package or endpoint in app source, no request in exercised browser flow. Release guard rejects known analytics endpoints in `dist`; future unrecognized vendor behavior requires renewed review. |

**Actual request capture:** `node scripts/audit/runtime-inventory.mjs` against the local production preview, with a keyless simulated injected provider and all third-party HTTP requests aborted. First load requested `/`, `/_astro/fees.DQsdHM4L.css`, `/_astro/TradingApp.CmsRjMWF.js`, `/_astro/client.BHjpRL8Y.js`, `/_astro/TradingApp.psgEthuH.js`, and `/_astro/index.BKL_-_Dm.js`, all same-origin. Opening the wallet dialog added no request. Connecting the simulated account attempted CoW Sepolia order history and trades reads and Hyperliquid testnet `/info`. Perps navigation retried those reads. No externally hosted script, stylesheet, font, image, analytics or wallet-connectivity service was requested. The final capture recorded `violations: []` and two inline style nodes (one `data-styled` ConnectKit node and one small generated style). These are fixture observations, not a universal statement about all wallet extensions.

The first capture exposed six **CSP-blocked** attempts to `ethereum-rpc.publicnode.com` and `ethereum.reth.rs/rpc` after wallet connection. Wagmi had mounted mainnet transports despite the trade preflight gate, and ConnectKit's connected button independently tried to resolve ENS through its own Ethereum mainnet fallback. `Wallet.tsx` now mounts only Ethereum Sepolia in wagmi and renders a local connected-address/disconnect button; ConnectKit still supplies the disconnected wallet modal. The injected provider remains the balance source. The testnet release's existing mainnet execution gate remains intact. The post-fix capture and Playwright assertion must show no mainnet requests or CSP violations.

| Script/stylesheet origin | Count in generated HTML | SRI rule |
| --- | ---: | --- |
| Same-origin generated assets | One CSS link; Astro JS entrypoints | Content-addressed build files and restrictive CSP; cross-origin SRI requirement does not apply. |
| External script or stylesheet | **0** | Release artifact check fails any external tag without a cryptographic `sha256`/`sha384`/`sha512` integrity attribute and `crossorigin="anonymous"`; protocol-relative and unquoted forms are tested. |
| External CSS `@import` or `url()` | **0** | Rejected in artifact check. |

## CSP and browser controls

| Directive | Before | After / reason |
| --- | --- | --- |
| `connect-src` | `'self'`, `https://*.cow.fi`, Hyperliquid testnet **and mainnet**, Sepolia **and mainnet** public RPC hosts, Base and Arbitrum RPC hosts | `'self'`, exact CoW API, exact Hyperliquid testnet API and RPC, two public Sepolia RPC fallbacks. No wildcard, broad scheme or mainnet host. |
| `script-src` | `'self'` plus Astro-generated SHA-256 hashes | Same; no `unsafe-inline`, `unsafe-eval` or remotely hosted executable. |
| `style-src` | `'self' 'unsafe-inline'` | Same. Astro emits inline styles and ConnectKit uses runtime styled-components style tags; the browser capture counts these. The script policy retains hashes and the dependency scripts are self-hosted. Removing inline CSS would require a wallet UI/style-system replacement, beyond this phase. |
| `font-src`, `img-src` | `'self' data:` | `'self'`; no data or remote font/image resources observed or required in the exercised flow. |
| `default-src`, `object-src`, `base-uri`, `form-action` | `none`, `none`, `self`, `self` | Same. Absent source directives fall back to `default-src 'none'`. |
| `frame-ancestors` | `none` in Cloudflare `_headers` | Same HTTP response directive; meta CSP cannot enforce it. |

Astro's generated meta CSP and `dist/_headers` HTTP CSP are compared byte-for-byte by the artifact guard. Cloudflare Pages can serve the `_headers` policy; arbitrary IPFS gateways may ignore it, and meta CSP cannot provide all header-only protections. Therefore a gateway is not approved as a dedicated storage origin. Phase K's public-origin blocker remains.

## Release checks and limits

`pnpm release:check` rejects direct analytics dependencies and app-source analytics imports, builds the production artifact, then runs `node scripts/release/artifacts.mjs` before Playwright. The guard fails closed on missing/mismatched CSP, wildcard/broad schemes, `unsafe-eval`, missing script hashes, unexpected connect hosts, remote executable/style without SRI+CORS, remote CSS resources, analytics endpoints, secret-like assignments or credential-bearing URLs, source maps, and added mainnet execution paths. The unit suite mutates independent fixtures for each class and expects failure. It also checks the actual generated artifact after build. The transitive SDK contains **bare mainnet URL constants** and wallet vendor code even though the release gate and CSP prevent their execution; the guard permits those exact inert constants and rejects explicit mainnet execution paths. It is not a cryptographic proof that arbitrary code could never synthesize another URL; the Playwright network/CSP assertion and typed execution preflight supply the runtime boundary.

No package was removed: there were no external runtime script, stylesheet or font dependencies to replace. ConnectKit and its transitive WalletConnect/Reown code remain bundled. Avoiding all embedded vendor telemetry code would require replacing ConnectKit; no telemetry endpoint was observed or allowed in this release. No API key, private key, mnemonic, client RPC credential, source map or analytics identifier was found by the artifact guard. Pattern scanning is bounded and cannot rule out deliberately encoded secrets; the previous history audit and tracked-file guard remain separate checks.

## Acceptance status

The [exact clean-tree release-check output](release-check.txt) records 93 passing unit tests, 16 passing Playwright tests, 57 typechecked files with zero diagnostics, a three-page production build, and a passing 123-file artifact gate. The [browser request capture](runtime-inventory.json) has no CSP violations or unexpected external origins. Static supply-chain checks and the offline browser flow are release-gated. Real dedicated HTTPS headers/TLS and storage readback remain unverified, so Assumption 8 stays **OPEN**. A funded external Sepolia and Hyperliquid testnet wallet, operator-approved signatures, real fills, settlement IDs, network-to-IndexedDB-to-CSV reconciliation, and derivative accounting support are still required for Phase H-live acceptance. No fee activation or mainnet execution is permitted.
