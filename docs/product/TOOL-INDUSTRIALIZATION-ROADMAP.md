# PIT tool industrialization, Phases AH–AO

Planning targets are discovery prompts, not a mandate to create 90–100 separate pages. Prioritize local, wallet-free calculations. Group related operations behind one coherent interface when input context and result interpretation are shared. Every new tool needs a distinct user decision, not merely a new formula name.

| Phase | Shared engine / candidate modules | Product boundary |
| --- | --- | --- |
| AH | Delivered: 12 pure operations in two tools, Token & Fee Converter (4) and Yield & Growth Planner (8). Exact decimal scaling, rate denominations, APR/APY, discrete growth, contributions, income principal and recovery. | Targeted acceptance only; neither tool enters the six-tool hosted read-only beta. Never label APR as APY or assume a live rate. |
| AI | Trade sizing, average price, breakeven, spread, slippage, gas and fee mathematics; roughly 10–15 operations | Reuse Swap Cost where it already answers the question; no executable quote or order path. |
| AJ | Weighted allocations, cost-basis scenarios, return decomposition and drawdown from manual series; roughly 10–15 operations | Extend Portfolio Exposure only where it remains understandable; no automated wallet discovery or tax conclusion. |
| AK | Rewards, vesting schedules, staking yield scenarios and time-based compounding; roughly 10–15 operations | Explicit emission/price assumptions; no staking transaction or claimed future yield. |
| AL | Collateral ratio, borrow interest, liquidation buffers and leverage scenarios; roughly 10–15 operations | Keep protocol-specific parameters manual and distinguish from existing generic Liquidation Calculator. |
| AM | Constant-product and concentrated-liquidity math, tick/range scenarios and fee break-even; roughly 10–15 operations | Reuse Impermanent Loss baseline; no claim to predict actual pool returns or execute LP actions. |
| AN | Decimal/ABI/address utilities, local CSV hygiene and report-format helpers; roughly 10–15 operations | Group utilities by task; do not expose arbitrary code execution or import untrusted content into Taxlot stores. |
| AO | Consolidated regression, security/privacy review and release decision | Complete `CI=1 pnpm release:check`, browser/mobile/keyboard, numeric references, compatibility, CSV/JSON, CSP, artifact allowlists, noindex and absence of execution code. |

External-data ideas (prices, rates, on-chain reads, bridge availability) remain separately reviewed candidates, not pure workflow nodes. Transaction ideas remain outside this campaign. Avoid duplicating existing PnL, Swap Cost, Bridge Cost, Portfolio Exposure, Liquidation and Impermanent Loss results under new names.

For each candidate: state the distinct user question; define ID, pure contract and explicit units; write the exact calculation and independent example; validate incomplete/error states; build a focused accessible UI; add to the user-facing registry only if it is a real tool; verify privacy/security and targeted tests; add optional local export and concise limitations. During AH–AN, run targeted tests/typecheck/build guards for touched surfaces. AO is the large consolidated regression and public-readiness review. No feature is public-release-ready merely because its phase's targeted tests pass.
