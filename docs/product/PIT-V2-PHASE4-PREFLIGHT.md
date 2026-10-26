# PIT V2 Phase 4 — Base Sepolia preflight (NO BROADCAST)

Status: **funded; transaction authorization pending**. This is a bounded testnet envelope, not a deployment record. Recheck all live values immediately before the operator GO and before every transaction. No external PIT transaction has been sent.

## Reviewed source and minimal deployment set

- Source: `a9dc1c48c0a8bffb202cb3f201a2d5d791e2912d`.
- Phase 3 manifest SHA-256: `85152c55be03be7be03416ead5023d8cbb7706112778b8126d0a4604663f8f0f`, reproduced on this source.
- Solidity 0.8.24, optimizer 200 runs, OpenZeppelin Contracts 5.5.0.
- Shared infrastructure: one `PitTokenFactory`, one `PitMultiSender`. Both have no owner or PIT fee role.
- Created through the factory: one `PitStandardToken`, one `PitAdvancedToken`. No direct template deployment.
- User-specific: one `PitTokenLock`, one `PitTokenVesting`. These are funded separately.
- No implementation proxy, separate token template deployment, or real payment contract is required.

## Dedicated test identities and exact scope

| Role | Public address | Authority |
|---|---|---|
| PIT testnet deployer, token creator, advanced admin, lock and vest beneficiary | `0xCb8c794c7B33FeC20C30D970725933bE1fc656C6` | Locally generated encrypted Foundry keystore; offline message challenge recovered this address. Keystore and password file are outside Git, mode 0600. |
| MultiSender recipient A | `0xA945c984d4cD94528D0Ee3eCEe540EE66F1843B0` | Dedicated encrypted test keystore; token receipt only. |
| MultiSender recipient B | `0xf938C5E7D1e6bf62a2399aE6b14ca13708478ab7` | Dedicated encrypted test keystore; token receipt only. |

The existing `deopt-deployer` keystore is out of scope. No private key, seed phrase, keystore password, real wallet, or PIT merchant address belongs in this deployment record. At Base Sepolia block **50,288,395**, the signer's read-only RPC balance was **0.001 test ETH** and nonce **0**. The funding transaction hash was not supplied; the balance and chain ID were independently read back.

| Instance | Test configuration | Initial authority |
|---|---|---|
| Standard token | `PIT4 Test Standard` / `P4STD`, 18 decimals, 1,000 units initially to the testnet deployer | No admin or further minting. |
| Advanced token | `PIT4 Test Advanced` / `P4ADV`, 18 decimals, 100 initial units, 150 cap, mint/burn/pause enabled, initial recipient deployer | Deployer is sole delayed-transfer default admin and initial minter/pauser; one-day admin transfer delay. |
| MultiSender | Standard token, 10 units to recipient A and 20 to recipient B | Spend only the caller's exact 30-unit allowance. |
| Locker | Standard token, 25 units, deployer beneficiary | Immutable beneficiary; fund before unlock; unlock 15–30 minutes after its deployment block time. |
| Vesting | Standard token, 100 units, deployer beneficiary | Immutable beneficiary; start 15–30 minutes after its deployment block time; 20-minute duration and 5-minute cliff after start. |

The relative UTC schedule bounds are part of the proposed approval envelope. If actual timestamps, amounts, addresses, preset privileges, bytecode, or spending cap change materially, obtain a new GO. Negative behavior is tested with read-only calls, not intentionally reverted paid transactions. No PIT service fee or USDC transfer is in scope.

## Read-only network and cost snapshot

Official Base Sepolia RPC: `https://sepolia.base.org`, chain ID **84532**. At the 2026-10-26 preflight, block **50,285,414** had gas limit **120,000,000**, base fee **5,000,000 wei**; `eth_gasPrice` returned **6,000,000 wei**, and the median sampled priority reward was **1,000,000 wei**. The public endpoint's availability and pricing can change. The OP Stack GasPriceOracle returned an operator fee of zero for sampled gas values; its sampled L1 upper-bound values were small, but they are not guarantees for later transactions.

A preflight `OPTIONS` request with local origin `http://127.0.0.1:4414` received HTTP 200 and `Access-Control-Allow-Origin` for that origin with POST and Content-Type permitted. This confirms CORS preflight behavior at that instant, not a complete browser-wallet acceptance or a provider availability guarantee.

`eth_estimateGas` on the exact reviewed deployment bytecode, from the unfunded dedicated address, returned factory **2,833,766**, MultiSender **594,448**, locker **582,720**, and vesting **795,287** gas. A read-only state override containing the reviewed factory runtime returned **514,445** for standard creation and **1,559,891** for advanced creation. These are predeployment estimates, not receipts. Locker and vesting constructor estimates used illustrative future timestamps and the deployer's address as a placeholder token address, because the disposable token does not exist yet. Re-estimate every write against actual deployed state before signing.

## Proposed authorization envelope — not yet granted

19 successful transactions: two shared deployments; standard and advanced creation; advanced mint, pause, unpause, burn; one exact batch approval and one two-recipient send; locker deployment, approval, funding, release; vesting deployment, approval, funding, partial release and final release. Simulated negative calls and source verification do not broadcast. Each successful receipt and state readback gates its dependent step.

With signer nonce 0 and exactly this ordering (both shared deployments, token creations and admin checks, batch, lock deployment/funding, vesting deployment/funding, then time-based releases), predicted `CREATE` addresses are: factory `0xE861d10ab302B66f619b15323C96d9F3BbfDc230`, MultiSender `0xf1c076cDF4A3C0bbBc491cF3578CA2F3d99424eA`, standard token `0x8ECa4F7e0B62eB0937A360074E5d67c3e6f1858a`, advanced token `0x1378294Fc8fCE1dA23A5a69025e9534FED32bee2`, locker `0x0d3bC5ADA20de6B05967c947E559a4f3C662e1C6`, and vesting `0x1b7844B2d4fAC6Eaa36c6A0F837C3d3E0F183970`. These are **conditional predictions, not deployed contracts**. A changed nonce or transaction order invalidates them and requires renewed review.

The sum of provisional **per-transaction gas-limit ceilings** is **9,550,000** gas; individual caps range from 80,000 to 3,200,000 gas. At a proposed **50,000,000 wei (0.05 gwei) max fee per gas**, the L2 ceiling from those caps is **0.0004775 test ETH**. Reserve an additional **0.00002 test ETH per transaction** for L1 data and operator fees, or **0.00038** across the 19 writes. This planning sum is **0.0008575 test ETH**; proposed **aggregate all-in campaign spend ceiling: 0.0009 Base Sepolia test ETH**. Read the on-chain GasPriceOracle again before every write and stop if its upper bound plus the operator fee exceeds that transaction's reserve. Check actual signer balance deltas after each receipt; stop if the next worst-case cost could exceed the remaining campaign allowance. The sampled `eth_gasPrice` remained **6,000,000 wei** at block 50,288,395, below the proposed 50,000,000-wei cap. The currently funded **0.001 test ETH** balance is sufficient only while these explicit ceilings hold; do not top it up silently.

`scripts/operations/sepolia-budget.mjs` implements the pure per-action gas, fee, nonce, signer, funding and aggregate-budget rejection rules, with negative tests. It is **not a broadcaster**. After GO, every actual write must pass this guard with fresh RPC values in the same controlled transaction path, plus destination/calldata checks; the existence of this module alone does not authorize or perform a transaction.

Funding does **not** authorize PIT to broadcast. Only the explicit `GO PIT4 BASE SEPOLIA` response to this displayed envelope may authorize the first PIT testnet write. No Base mainnet, Ethereum mainnet, real USDC, PIT fee, hosted deployment, or production infrastructure change is included.

## Remaining safe work and release boundary

Before GO: refresh signer funding and nonce, chain/fee estimates, and exact source/build artifacts; confirm the all-in fee guard and browser preview policy. The operations frontend is still Anvil-only; Base Sepolia execution remains disabled. After GO, receipt, runtime code, role and on-chain state checks must precede browser activation. Browser acceptance requires ordinary wallet confirmation; the encrypted CLI keystore alone does not prove browser-wallet availability. This campaign does not verify hosted SIWE or authorize a public operations site.
