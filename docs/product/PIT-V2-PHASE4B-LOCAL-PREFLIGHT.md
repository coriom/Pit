# PIT V2 Phase 4B — private wallet preflight

This is a **local, testnet-only preparation**. It does not authorize a Base Sepolia transaction or public source submission. The existing Phase 4 factory, MultiSender, tokens and completed schedules remain the reviewed on-chain baseline. The original read-only Base Sepolia preview, free Toolbox and Explorer retain their separate builds.

## Browser boundary

`pnpm operations:sepolia:wallet:check` builds six noindex pages under `dist-operations-sepolia-wallet/`. It requires `PIT4B_LOCAL_WALLET_PREVIEW=enabled`; the transaction path additionally requires a separately reviewed `PIT4B_CAMPAIGN_PATH`. Without a campaign, the built package contains no transaction sender. The page rejects writes unless it is served from `localhost` or `127.0.0.1`, the wallet reports chain 84532 and exactly the reviewed signer is selected. There is no chain-switch fallback, PIT fee, SIWE requirement, account system or mainnet route.

For a safe browser inspection before campaign approval, build without `PIT4B_CAMPAIGN_PATH` and serve `dist-operations-sepolia-wallet/` on `127.0.0.1` using `PIT_OPERATIONS_MODE=base-sepolia-wallet PIT4B_LOCAL_WALLET_PREVIEW=enabled pnpm exec astro preview --config astro.operations.config.mjs --host 127.0.0.1 --port 4416`. Open `http://localhost:4416/` from the operator's browser on the same machine. This inspection can connect MetaMask and review the four forms but cannot send a transaction. After a separately approved, fresh campaign is built locally, the four forms are prefilled; the operator still reviews each simulation and confirms each transaction in MetaMask. The campaign-only receipt export contains public transaction hashes and the public signer address, with no wallet secrets.

The user explicitly selects a discovered EIP-1193 provider. Every write rechecks account, chain, nonce, destination, exact calldata hash, current reviewed contract code, simulation, gas ceiling, fee ceiling, estimated L1 data fee and previous campaign receipts. The wallet confirmation is followed by a successful receipt and relevant contract state readback. Any unexpected account, chain, nonce, code or prior transaction fails closed. A lost browser session may require a manual read-only reconciliation before continuing; it does not authorize a blind replay.

## Local evidence and real-wallet limit

The four page journeys can be exercised on an isolated Anvil fork with the local-only fixture in `tests/operations-wallet-e2e/prepare-anvil-fork.mjs` and `playwright.operations-sepolia-fork.config.ts`. That fixture uses an impersonated local address through a test EIP-1193 adapter. Its transactions, receipts and state are real **on the local fork**, but it is **not** a browser wallet extension and cannot satisfy real-wallet acceptance. Negative UI tests use a labeled mock provider. A genuine extension test must be reported independently.

The existing Phase 4 encrypted CLI signer must never be imported into an extension. The operator selected the existing MetaMask address `0x8B87aECC9413C2c5b853e81AA94b60990e7aBdbE` for this bounded test. This choice does not verify it as a merchant payout address. Neither its private key nor a recovery phrase belongs in Git, chat, logs or test artifacts. No Base Sepolia write may occur before the new `GO PIT4B TESTNET` envelope is approved.

## Exact campaign preparation

`PIT4B_BROWSER_WALLET_ADDRESS=<approved public address> node scripts/operations/prepare-pit4b-live-campaign.mjs` performs **read-only** Base Sepolia checks and writes local mode-0600 review files under `/tmp`. It refuses the old CLI address, a pending browser nonce, unexpected contract code, insufficient browser ETH or a changed factory nonce. It uses the existing factory and MultiSender, then proposes **eleven** exact browser transactions: standard token creation, exact MultiSender approval and distribution, locker deployment/approval/funding/release, and vesting deployment/approval/funding/one mature release. The newly created disposable token supplies the other three tools, so the CLI signer sends no funding transaction. The two recipients are the prior Phase 4 demonstration recipients. The locker and vesting beneficiary is the approved MetaMask address. The campaign encodes exact calldata hashes, nonce order, gas ceilings, form defaults and expiration; approval must refer to a **fresh** generated review and must be renewed if material parameters change.

`node scripts/operations/prepare-sourcify-v2.mjs` prepares six mode-0600 standard-JSON payloads under `/tmp/pit4b-sourcify-v2`; it makes no POST. `GO PIT4B SOURCIFY` is a separate permission because the source becomes public. A successful RPC runtime hash comparison is not public source verification.

## Outstanding gates

- A real isolated browser wallet must connect and sign the four journeys, including wallet confirmations; local adapter tests do not meet this gate.
- Current wallet balance and nonce, fee quote, timestamps, campaign file hash and exact budget must be reviewed before requesting `GO PIT4B TESTNET`. No ETH top-up is planned at the balance observed on 2026-10-27.
- No Sourcify submission occurs without `GO PIT4B SOURCIFY` for the exact payload hashes.
- Full release acceptance and a fast-forward GitHub push remain conditional on real-wallet acceptance. Phase CE changes in the original worktree remain outside this branch.
