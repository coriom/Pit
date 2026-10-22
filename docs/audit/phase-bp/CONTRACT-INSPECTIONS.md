# Phase BP — bounded contract inspection

Eight distinct read-only tasks were added to the separate Explorer build. No contract is classified as safe or malicious. Queries use explicit Ethereum/Base selection, fixed public RPC endpoints and sampled block context. No wallet connection, execution, analytics or deployment occurred.

| Route | Read and output boundary |
| --- | --- |
| `/inspect/proxy-storage/` | EIP-1967 implementation/admin/beacon slots and narrow EIP-1167 bytecode pattern; signal only |
| `/inspect/bytecode-compare/` | Keccak hash and byte length of two chosen runtime bytecodes at explicit chain/block contexts; identical code does not imply identical state |
| `/inspect/ownership-role/` | Ownable `owner()`, AccessControl `getRoleAdmin` and `hasRole` for one supplied account/role; no member enumeration |
| `/inspect/erc20-contract/` | Self-reported name, symbol, decimals and exact raw total supply; no identity or price verification |
| `/inspect/permit-signals/` | `DOMAIN_SEPARATOR()` and `nonces(account)` method responses; a signal, not proof that a permit signature works |
| `/inspect/erc165-interface/` | `supportsInterface(bytes4)` claim for a user-supplied ID; distinct substitute for global mint/burn search |
| `/inspect/timelock-standard/` | OpenZeppelin-style `getMinDelay`, proposer/executor role IDs and selected-account role status; no operation queue enumeration |
| `/inspect/safe-multisig/` | Safe-compatible owners (maximum 20), signature threshold and nonce; modules, guards and queued transactions excluded |

The EIP-1967 slot constants come from [ERC-1967](https://eips.ethereum.org/EIPS/eip-1967). Safe `getOwners` semantics are in [Safe documentation](https://docs.safe.global/reference-smart-account/owners/getOwners). The application does not infer token identity from a symbol or standard support from an unverified address. Unsupported ABI methods are shown as unavailable or rejected; missing values are never converted into zero.

The planned token mint/burn **historical event explorer** remains `BLOCKED_EXTERNAL`: the fixed free provider documents historical `eth_getLogs` as paid-tier and a public probe timed out. The earlier transaction Transfer-event inspector can show a *single receipt* but already exposes the same mint/burn signals, so duplicating it as another page would inflate the catalogue. The ERC-165 interface question is a genuinely distinct substitute.

Validation: 20/20 focused BN–BP Vitest tests passed, including independently specified EIP-1967 slot, raw supply, threshold, delay and pre-network rejection cases. `pnpm check`: 344 files, zero errors. Local Chromium loaded all eight new routes without background RPC; ordinary Explorer smoke had three passes and five intentionally skipped live-provider cases. A separate live Chromium run exercised all eight with public example contracts (USDC, Multicall3, ENS NameWrapper, an OpenZeppelin-style timelock and a Safe); every route returned its expected field. This establishes current data retrieval, not future availability or contract trust. `pnpm explorer:check`: 22 inspections, 24 HTML pages, 28 package files, 187,594 bytes, package SHA-256 `9f8d04118a14dc86d352d272723492ba917e3eb66a4629aa05310cdc775d89e9`. The offline Toolbox and historical six-tool beta package hashes remained `a25e0b9a1cd1fac7319e082b1878636c5559200dfa9ffe9b2baf96b5a14a7a77` and `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. Firefox and the complete release gate remain deferred to BS.
