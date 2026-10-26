# PIT V2 Phase 4B — private wallet preflight

This is a **local, testnet-only preparation**. It does not authorize a Base Sepolia transaction or public source submission. The existing Phase 4 factory, MultiSender, tokens and completed schedules remain the reviewed on-chain baseline. The original read-only Base Sepolia preview, free Toolbox and Explorer retain their separate builds.

## Browser boundary

`pnpm operations:sepolia:wallet:check` builds six noindex pages under `dist-operations-sepolia-wallet/`. It requires `PIT4B_LOCAL_WALLET_PREVIEW=enabled`; the transaction path additionally requires a separately reviewed `PIT4B_CAMPAIGN_PATH`. Without a campaign, the built package contains no transaction sender. The page rejects writes unless it is served from `localhost` or `127.0.0.1`, the wallet reports chain 84532 and exactly the reviewed signer is selected. There is no chain-switch fallback, PIT fee, SIWE requirement, account system or mainnet route.

The user explicitly selects a discovered EIP-1193 provider. Every write rechecks account, chain, nonce, destination, exact calldata hash, current reviewed contract code, simulation, gas ceiling, fee ceiling, estimated L1 data fee and previous campaign receipts. The wallet confirmation is followed by a successful receipt and relevant contract state readback. Any unexpected account, chain, nonce, code or prior transaction fails closed. A lost browser session may require a manual read-only reconciliation before continuing; it does not authorize a blind replay.

## Local evidence and real-wallet limit

The four page journeys can be exercised on an isolated Anvil fork with the local-only fixture in `tests/operations-wallet-e2e/prepare-anvil-fork.mjs` and `playwright.operations-sepolia-fork.config.ts`. That fixture uses an impersonated local address through a test EIP-1193 adapter. Its transactions, receipts and state are real **on the local fork**, but it is **not** a browser wallet extension and cannot satisfy real-wallet acceptance. Negative UI tests use a labeled mock provider. A genuine extension test must be reported independently.

The existing Phase 4 encrypted CLI signer must never be imported into an extension. A separate PIT-only browser wallet must supply only its public address. Neither the private key nor a recovery phrase belongs in Git, chat, logs or test artifacts. No browser wallet funding or Base Sepolia write may occur before the new `GO PIT4B TESTNET` envelope is approved.

## Exact campaign preparation

With a new checksummed, unfunded browser address, `PIT4B_BROWSER_WALLET_ADDRESS=<public address> node scripts/operations/prepare-pit4b-live-campaign.mjs` performs **read-only** Base Sepolia checks and writes local mode-0600 review files under `/tmp`. It refuses the old CLI address, pending/nonzero browser nonce, unexpected contract code, missing CLI funds or token balance, existing browser allowance, fee quote above its preflight bound, or a changed factory nonce. The proposed plan uses two bounded CLI funding transactions, then twelve exact browser transactions: standard creation, exact MultiSender approval and distribution, locker deployment/approval/funding/release, and vesting deployment/approval/funding/two releases. The two recipients are the prior dedicated Phase 4 demonstration recipients. The locker and vesting beneficiary is the new browser signer. The campaign encodes exact calldata hashes, nonce order, gas ceilings and expiration; approval must refer to the **fresh** generated review and must be renewed if material parameters change.

`node scripts/operations/prepare-sourcify-v2.mjs` prepares six mode-0600 standard-JSON payloads under `/tmp/pit4b-sourcify-v2`; it makes no POST. `GO PIT4B SOURCIFY` is a separate permission because the source becomes public. A successful RPC runtime hash comparison is not public source verification.

## Outstanding gates

- A real isolated browser wallet must connect and sign the four journeys, including wallet confirmations; local adapter tests do not meet this gate.
- The new browser address, current funding state, fresh fee quote, timestamps, campaign file hash and exact budget must be reviewed before requesting `GO PIT4B TESTNET`.
- No Sourcify submission occurs without `GO PIT4B SOURCIFY` for the exact payload hashes.
- Full release acceptance and a fast-forward GitHub push remain conditional on real-wallet acceptance. Phase CE changes in the original worktree remain outside this branch.
