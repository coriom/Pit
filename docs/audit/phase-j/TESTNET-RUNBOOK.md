# Phase J — testnet operator runbook

**No live acceptance has occurred.** Run `pnpm release:check` from a clean checkout before a separately authorized live session. A passing release check is offline evidence only. Use an external wallet; never supply a private key, seed phrase, API secret or keystore password to PIT. Do not create a private-key `.env.local`.

## CoW / Ethereum Sepolia prerequisites

1. Start `pnpm dev` on loopback, or use a separately approved dedicated HTTPS origin with working IndexedDB. The production allowlist is currently empty. Shared IPFS paths are unsuitable; storage refusal also blocks execution.
2. Connect the funded external wallet and select **Ethereum Sepolia: decimal 11155111, hexadecimal 0xaa36a7**. **Base Sepolia is decimal 84532 / 0x14a34, a different chain. Funds there do not fund Ethereum Sepolia.** Do not sign, bridge or transfer merely to clear a warning; acquire the required test assets separately.
3. Confirm CoW orderbook base `https://api.cow.fi/sepolia` (SDK requests beneath `/api/v1`), settlement `0x9008D19f58AAbD9eD0D60971565AA8510560ab41`, relayer/spender `0xC92E8bdf79f0507f65a392b0ab4667716BFE0110`. SDK `env: prod` selects CoW's canonical **Sepolia** deployment, not Ethereum mainnet. Chain ID, explicit API URL and contract identities are checked together.
4. Select two distinct ERC20 contracts actually deployed on Ethereum Sepolia. PIT checks bytecode and token decimals/balance using the wallet provider. Native ETH and identical addresses are unsupported; the CoW quote API must also accept the pair and return liquidity. Do not reuse Base Sepolia token addresses or assume matching symbols establish identity.
5. Have enough sell tokens and Ethereum Sepolia ETH. If approval is required, the release gate requires twice the current estimated approval gas cost. Gas estimates are not a guarantee of future cost. Minimum trade value/liquidity are protocol-dependent; do not increase the intended acceptance amount automatically to obtain a quote.
6. Request a quote. Wait for preflight GREEN, inspect account, Ethereum Sepolia chain, sell/buy addresses, exact sell amount, SDK helper-derived minimum receive and costs, and **zero PIT partner fee**. Approval gas is separate. Quotes expire after 60 seconds; refresh expired quotes.
7. **Before each signature/transaction, the operator explicitly confirms that wallet prompt.** First inspect the exact token approval amount and pinned relayer; reject unlimited or unfamiliar approvals. Then inspect the CoW order typed-data chain, settlement contract, assets, quantities and appData before approving its separate signature. Never approve an unexplained prompt. PIT does not auto-confirm the external wallet.
8. Execute only the separately authorized minimal acceptance swap. Preserve order UID, settlement hash, account, chain, exact executed quantities/fees and timestamps. Verify against the Sepolia orderbook and chain explorer, then reconcile stored `trade` → Taxlot CSV → actual importer, including metadata differences documented in Phase I. Submission alone is not a fill.

## Hyperliquid testnet prerequisites

1. Use an externally controlled **Hyperliquid testnet-funded account**. Ethereum Sepolia ETH or Base Sepolia ETH is not Hyperliquid testnet collateral. The EVM chain selected in the wallet does not select the Hyperliquid execution network.
2. Verify exact API base `https://api.hyperliquid-testnet.xyz`: `/info` for reads, `/exchange` for execution; explorer RPC base `https://rpc.hyperliquid-testnet.xyz`. Both exact URLs and `isTestnet === true` must pass. Mainnet hosts, suffix lookalikes and mismatched environment flags fail closed. The transport rejects redirects.
3. Use loopback or an approved dedicated HTTPS origin with writable accounting IndexedDB. Confirm market, side, limit price, size and reduce-only setting. Opening orders require available collateral covering full limit notional; PIT does not change leverage. Reduce-only requires an existing opposing position and cannot exceed its size. Exchange fee/margin checks can still reject an order.
4. Wait for preflight GREEN. PIT builder fee must show **0% disabled**; no builder approval is needed or available, and submitted orders omit `builder`. **The operator must inspect and explicitly approve each wallet signature.** Reject any mainnet or unexpected approval request.
5. Execute only the separately authorized minimal testnet order. Record order/fill identifiers, raw submitted fields, terminal status, exact fill quantities/fees and timestamp. Close residual exposure only as separately required by the acceptance procedure, with another explicit wallet confirmation. Do not call a resting GTC order a fill or automatically place replacement orders.
6. Verify raw derivative observations retain `taxlot_status: unsupported_derivative_v1`. They must never appear as spot Taxlot events or Taxlot CSV. Phase I's derivative boundary remains in force.

## Stop conditions

Any non-GREEN predicate, missing funding, failed read, wrong account/network/endpoint, unavailable storage, fee activation, unexpected prompt, missing settlement or reconciliation discrepancy stops execution. There is no force flag, URL/storage override or development signing bypass.

Assumption 8 remains **OPEN**: no dedicated public origin is deployed or independently verified. Live Phase H remains blocked until the external funded accounts and operator-approved session are supplied. Mainnet/fee activation remains forbidden under the unchanged legal gate.
