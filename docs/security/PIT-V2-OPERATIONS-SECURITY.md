# PIT V2 operations: internal security review

Scope: `contracts/src/PitTokens.sol`, `PitMultiSender.sol`, `PitSchedules.sol`, the generated ABI/bytecode, the isolated operations browser and its Anvil tests. This is an internal source review plus automated tests, **not an independent audit**. No external transaction or payment was sent.

## Threat and privilege model

| Operation | Asset / authority | Authorized actor | Main loss mode and enforced boundary |
|---|---|---|---|
| Standard creator | Initial token supply | Factory caller chooses recipient | Recipient error is irreversible; token has no mint, pause, blacklist or PIT role. |
| Advanced creator | Mint, pause and role authority | Actual factory caller holds sole default admin; enabled roles start there | Cap bounds total supply. One-day, two-step admin transfer prevents immediate reassignment. A caller contract, not its human initiator, receives roles. |
| MultiSender | Payer's existing ERC-20 allowance | `msg.sender` alone | Contract transfers from that caller, never a supplied payer address. Bounded 1–100 recipients, all-or-nothing, non-reentrant. Revert rolls back every transfer. |
| Locker | Funded ERC-20 balance | Anyone funds before unlock; immutable beneficiary releases at/after unlock | No early release, owner or PIT recovery. Wrong-token and direct extra transfers can remain trapped. |
| Vesting | Once-funded allocation | Anyone may fund before start; immutable beneficiary releases vested amount | Cliff and integer floor constrain release; no revocation or owner. Direct late tokens are outside `allocation` and can remain trapped. |

The local browser trusts an injected EIP-1193 wallet and a loopback Anvil process. It checks chain ID 31337 on both and checks the selected account before every write, including immediately before the wallet request. A malicious local process or wallet extension is outside this MVP trust boundary. The browser never imports a private key. The separate operation bundle is noindex and permits only loopback RPC; the free Toolbox keeps `connect-src 'none'` and zero JavaScript chunks.

## Findings and dispositions

| Severity | Finding | Disposition and evidence |
|---|---|---|
| MEDIUM, fixed | The advanced token's original `AccessControl` default admin could grant another default admin immediately. | Replaced with OpenZeppelin 5.5.0 `AccessControlDefaultAdminRules(1 days, administrator)`. Tests reject direct admin grants and premature acceptance; transfer succeeds after delay. An admin can still grant enabled non-admin roles. |
| LOW, fixed | A changed wallet account could leave reviewed form state visible. | Reconnection clears prepared state; every write rechecks active account and network. Chromium tests cover wrong chain, changed account and rejected transaction with no false success. |
| MEDIUM, accepted design restriction | ERC-20 transfers made directly to a lock or vesting contract bypass `fund`, and unrelated tokens cannot be claimed through the schedule. | The contracts track only explicit funding. Tests prove direct/late amounts do not change allocation. The UI and documentation warn against direct sends. A recovery feature would need its own review because it could weaken the lock promise. |
| MEDIUM, accepted token restriction | Malicious tokens can lie in `balanceOf`; rebasing can change balances after a check. | Standard ERC-20 accounting only. Exact before/after deltas reject ordinary transfer fees; false/reverting token and callback fixtures are tested. No universal safe-token claim. |
| LOW, operational | A helper may already be deployed or an allowance set if a later local step fails. | Receipts are shown separately; the user must inspect them before retrying. The UI does not call a transaction hash a completed operation. |
| INFORMATIONAL | Contract-routed factory creation gives the router/contract the admin role. | Tested explicitly. Only direct wallet or reviewed smart-account calls should be used for the advanced preset; generic relayers are unsupported. |

No unresolved CRITICAL or HIGH finding was identified in this internal review. This is not proof that such a finding cannot exist. `forge lint contracts/src --severity high med` reported no high/medium diagnostic; Slither was not installed and was not used. Foundry's two stateful invariant campaigns each executed 64 runs × 32 calls with zero reverts, exercising mint/burn/transfers and funding/time/release transitions. Fee-on-transfer, false-return, reverting and callback tokens are separately tested. No PIT fee hook, operator role, arbitrary bytecode loader or token recovery privilege exists.

## Release boundary

Before any controlled Base Sepolia broadcast: approve the exact deployer/smart-account identity, intended administrator and beneficiaries, token identities, constructor values and RPC; review bytecode manifest; estimate chain-specific gas; authorize a distinct broadcast; inspect receipts and role readbacks. Mainnet use and real assets need an independent contract security assessment and new acceptance. The existing `FEES_ENABLED=false`, `MAINNET_ENABLED=false`, `UNISWAP_EXECUTION_ACCEPTED=false` and `PREMIUM_REPORTS_ENABLED=false` gates remain unchanged.
