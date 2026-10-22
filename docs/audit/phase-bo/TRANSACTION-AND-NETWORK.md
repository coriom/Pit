# Phase BO — transaction and network reads

This batch adds **six** separate read-only Explorer routes, keeping the offline Toolbox package unchanged. The Explorer now has 14 routes (eight BN, six BO), all behind explicit user action. Nothing was deployed.

| Route | Distinct user question | Important boundary |
| --- | --- | --- |
| `/inspect/transaction-detail/` | What confirmed transaction fields and receipt status exist for this hash? | No calldata intent or security inference; tx and receipt hash/block must match |
| `/inspect/network-gas/` | What sampled block fee/usage and provider gas suggestions are visible? | Provider suggestions are live observations, not pinned historical fees or quotes |
| `/inspect/blob-activity/` | How much blob gas appears in a sampled Ethereum block? | Substitutes activity for the proposed blob **fee** view because `eth_blobBaseFee` returned a paid-plan error; no fee is quoted |
| `/inspect/tx-transfer-events/` | Which Transfer-signature logs occurred in this one transaction? | Substitutes per-receipt inspection for historical transfer search; event signature alone cannot prove ERC-20 versus ERC-721 identity |
| `/inspect/base-transaction-cost/` | Which Base L2 execution and L1 data fee components are in this receipt? | Displays a subtotal of known components; operator/other fee coverage is explicitly unverified |
| `/inspect/multicall-static-reads/` | Can up to four selected token metadata fields be read at one block? | Only fixed `totalSupply`, `decimals`, `symbol`; uses verified Multicall3 address and one pinned `eth_call` |

The implementation checks a fixed chain ID before reading, limits responses to 64 KiB, allows at most 20 RPC calls per inspection, has a 10-second client timeout and no automatic retries. It validates transaction hashes and contract/method entries before submitting user inputs. Receipts with over 500 logs, over 50 Transfer-signature matches or unsupported event encodings fail closed. Multicall allows four static reads and reports individual failures as unavailable. No wallet, signing, broadcast, traces, arbitrary endpoints, tracking or storage were added.

The free public endpoints returned `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `eth_getBlockByNumber`, transaction and receipt reads. The reviewed [Multicall3 project](https://github.com/mds1/multicall3) documents its shared address; code was read back on both Ethereum and Base. [dRPC Ethereum receipt documentation](https://drpc.org/docs/ethereum-api/transactionsinfo/eth_getTransactionReceipt) supports the transaction method. [Base network fee documentation](https://basehub.org/network/network-fees/) distinguishes L2 execution and L1 security fees; this page does **not** assert that those two fields capture every current fee component.

Three proposed BO capabilities remain **BLOCKED_EXTERNAL / not published**:

- Historical ERC-20 Transfer Explorer: `eth_getLogs` on the public endpoint returned a free-plan timeout; [dRPC Base event-log documentation](https://drpc.org/docs/base-api/eventlogs) labels this method paid-tier. A transaction-receipt-only substitute is provided.
- Transaction Revert Inspector: [dRPC tracing documentation](https://drpc.org/docs/ethereum-api/debugandtrace) labels tracing paid-tier. One `callTracer` probe did return data, conflicting with the stated tier policy; this does not establish dependable free access or sufficient coverage for failed transactions. No revert reason is invented.
- ERC-4337 UserOperation Inspector: `eth_getUserOperationByHash` returned `-32601 method is not available` on the fixed Ethereum endpoint. No bundler was silently added.

`eth_blobBaseFee` returned code 35, “method is not available on free plan, please upgrade to paid plan.” Blob activity does not use that method. Public provider availability and any future commercial-use terms remain separate publication checks.

Focused Vitest: 14/14 BN+BO tests pass. `pnpm check`: 341 files, zero errors. Local Chromium route/privacy smoke passes for all 14 routes (2 passed; four optional live tests skipped in the ordinary run). In live Chromium, all six BO routes produced the expected fields using public examples, although one sequential run timed out on a Base receipt and the targeted Base retry passed. The timeout is retained as evidence of public-endpoint reliability limits. `pnpm explorer:check`: 16 HTML pages, 20 package files, 138,989 bytes, SHA-256 `017be1af853ea1fbe117fe0562a33d7505bde9d9897704eb707c82062d8e77ff`; NOT DEPLOYED. `pnpm toolbox:check` and `pnpm beta:check` retained package hashes `a25e0b9a1cd1fac7319e082b1878636c5559200dfa9ffe9b2baf96b5a14a7a77` and `f2907ac694594531e16ab5501e3be7d066edf98f528553f2bf2164dde725a425`. Firefox for this repository's Playwright version is not installed locally and remains deferred to BS.
