# Phase BN — bounded read-only Explorer foundation

The Explorer is a **separate static build** (`pnpm explorer:check`, `dist-read-only-explorer-host/`). It is not imported by the offline PIT Toolbox. No Explorer deployment or publication occurred. The offline Toolbox remains at 151 task experiences with `connect-src 'none'`; this batch adds eight separately packaged read-only inspections.

## Scope and substitutions

| Route | Read performed | Coverage boundary |
| --- | --- | --- |
| `/inspect/native-balance/` | `eth_getBalance` on Ethereum and Base | One supplied address, native balance only |
| `/inspect/selected-erc20-balances/` | `balanceOf` and `decimals` | Up to five **explicitly supplied** token contracts; replaces an impossible unindexed universal portfolio claim |
| `/inspect/selected-erc20-allowances/` | `allowance` and `decimals` | One explicitly supplied token and spender; does not scan every approval |
| `/inspect/nft-approval/` | ERC-721 `getApproved` and `isApprovedForAll` | One collection/token/operator; ERC-1155 operator scanning is not claimed |
| `/inspect/ens-resolver/` | ENS registry `resolver`, then on-chain `addr` | ASCII `.eth` on Ethereum; CCIP/off-chain records unsupported |
| `/inspect/nft-ownership/` | ERC-721 `ownerOf` or ERC-1155 `balanceOf` | One collection/token; unsupported standards fail explicitly |
| `/inspect/account-code/` | `eth_getCode`, EIP-1967 implementation slot | Narrow substitute for generic smart-account classification; code does not prove account capabilities or safety |
| `/inspect/wallet-nonce/` | `eth_getTransactionCount` | Latest confirmed transaction count, not pending or ERC-4337 nonce |

All reads require a user button press. Address, token and name inputs are validated before any request. RPC destinations are fixed in source; there is no endpoint field or dynamic provider selection. The client checks `eth_chainId`, pins reads to a sampled block, displays chain/provider/block, caps calls at 20 per inspection, enforces a 10-second client timeout and a 64 KiB response limit, and makes no retries. Errors do not become zero values. No request is made on page load. Inputs are not placed in URLs, browser storage or telemetry.

Fixed public endpoints are [dRPC Ethereum](https://drpc.org/docs/ethereum-api) and [dRPC Base](https://drpc.org/docs/base-api). dRPC [documents public nodes as free and subject to rate limits](https://drpc.org/docs/howitworks/ratelimiting), including regional throttling and a 2-second provider timeout. Availability can change. This private candidate makes no commercial-use or uptime guarantee; provider terms require a fresh review before publication. The ENS registry address is from [official ENS deployments](https://docs.ens.domains/learn/deployments/).

## Evidence

- 2026-10-22: Ethereum and Base `eth_chainId` returned `0x1` and `0x2105` with CORS from the local Explorer origin. A Playwright Chromium live read of a public zero address returned a sampled block and confirmed nonce. A separate live Chromium test exercised **all eight** routes using public example addresses/contracts/names; all returned their expected read fields. These are current provider observations, not an uptime guarantee.
- Focused Vitest: 7/7 pass, including fixed endpoint/allowlist, sampled-block, contract decoding, invalid-input-before-network, wrong-chain and oversized-response cases.
- Focused Chromium: 1/1 mocked route/navigation/privacy test passes; 3/3 optional live provider tests pass, including the eight-route probe.
- `pnpm check`: 337 files, zero errors. `pnpm explorer:check`: ten HTML pages (home, eight inspections, 404), one first-party JS bundle, 14 package files, 102,203 bytes, package SHA-256 `4ba68db3064272ca2aa3083f5fcc4fc99a3e9a18e7c08f72d138fed141d6d8ca`, strict CSP with only two fixed RPC connect origins, `noindex` and `robots.txt` blocking. The host includes exact inventory and hashes.
- `pnpm toolbox:check`: unchanged 151-task offline package hash `a25e0b9a1cd1fac7319e082b1878636c5559200dfa9ffe9b2baf96b5a14a7a77`.
- `pnpm beta:check`: historical six-tool package hash `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`.
- Firefox browser executable for the repository's Playwright version was unavailable at the expected local path; Firefox remains unverified for this batch and is scheduled for consolidated BS acceptance.

The Explorer's contract reads are not an exhaustive token, approval, ownership or contract-security audit. A public RPC provider receives submitted address/contract parameters. No wallet connection, signing, broadcast, backend, database, keys, paid service or deployment was introduced.
