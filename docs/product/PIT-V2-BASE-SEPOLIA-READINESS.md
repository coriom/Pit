# PIT V2 Base Sepolia deployment candidate — no broadcast

Base's [official network details](https://docs.base.org/get-started/connect-to-base) identify Base Sepolia chain ID **84532**, public read-only RPC `https://sepolia.base.org` and explorer `https://sepolia.basescan.org`. On 2026-10-25, read-only RPC calls returned `eth_chainId=0x14a34`, a block number, `eth_gasPrice` and `eth_feeHistory` successfully. Automated HTTPS access to the explorer returned HTTP 403, so explorer page behavior was **not verified**. The public endpoint is rate limited and is not a production provider commitment.

## Reproducible artifacts and deployment order

`forge build --offline` compiles with Solidity 0.8.24, optimizer enabled at 200 runs and pinned OpenZeppelin Contracts 5.5.0. On a **clean committed** worktree, `pnpm operations:manifest` writes `dist-operations-deployment/manifest.json` with the source commit, compiler settings, six contract names, constructor schemas, privilege expectations, creation-bytecode SHA-256 and compiled-runtime-template SHA-256. The artifact contains no key, signature or real deployment address. Constructor immutables change actual deployed runtime bytes; compare deployed code against the reviewed constructor-specific artifact, not only the template hash.

`contracts/script/PrepareDeployment.s.sol` simulates `PitTokenFactory` and `PitMultiSender` deployment on chain 31337 or 84532. It contains no `startBroadcast`, signer or private-key access; adding a CLI broadcast flag alone cannot emit its transactions. `pnpm operations:deployment:dry-run` verifies a local simulation mines no block, uses no account nonce and rejects chain 31338. The actual on-chain lifecycle rehearsal is `pnpm operations:anvil:test`, which executes only on ephemeral Anvil 31337. There is no Base Sepolia execution command in this candidate.

Future approved order: (1) deploy the factory and MultiSender to chain 84532; (2) have the intended creator directly call the factory for a token, verifying the `TokenCreated` event, total supply, recipient and advanced `defaultAdmin()`; (3) deploy a separate locker or vesting contract with reviewed constructor values; (4) approve the exact funding amount and call `fund`; (5) verify token balances, allowances, schedule constants and events. A contract wallet calling the advanced factory itself owns the roles. Do not route through a generic relayer. No token or schedule address is preapproved.

An eventual deployment envelope must specify `chainId=84532`, exact RPC URL, reviewed deployer address, contract/artifact hash, token identity and decimals, raw integer supply/allocation, recipient, beneficiary, UTC Unix timestamps, deadline, intended roles, gas limit, expected events and postflight assertions. Values remain **UNSET** here. Source verification would submit the exact compiler and constructor arguments to the Base Sepolia explorer, then compare source/bytecode, events, role owner, supply and token balances. A failed immutable deployment cannot be rolled back; stop routing to it and review a new deployment. A funded lock or vesting schedule has no emergency clawback.

## Local gas profile

Actual Anvil gas used (30,000,000 block gas limit; standard test token; not a Base Sepolia quote):

| Action | Gas units |
|---|---:|
| Factory deployment | 2,810,295 |
| Standard token creation through factory | 509,116 |
| Advanced token creation through factory | 1,532,930 |
| MultiSender deployment | 588,609 |
| Batch of 1 / 10 / 50 / 100 recipients | 69,261 / 365,716 / 2,192,858 / 5,647,997 |
| Lock deployment / approval / funding / release | 576,962 / 46,379 / 83,422 / 62,684 |
| Vesting deployment / approval / funding | 787,771 / 46,307 / 83,131 |
| Vesting partial / final release | 68,182 / 45,937 |

The 100-recipient batch stayed below half this local block limit. Re-estimate with the actual token and Base Sepolia provider before use. Local gas units and a sampled `eth_gasPrice` do not cover all L2 transaction components or future conditions; no ETH or fiat total is quoted. PIT service prices are proposals only and **zero service fees are collected**. The gas profile alone cannot establish commercial viability.

## Controlled testnet prerequisite

Require a separately authorized Base Sepolia broadcast decision, a reviewed deployer/test wallet and funding source, approved addresses/constructor values, a provider with suitable gas-estimation behavior, bytecode and privilege review, and a postflight plan. The current operations UI deliberately refuses chain 84532 and all remote broadcasts. Mainnet, payment collection and public publication remain outside this milestone.
