import { LOCAL_TOOL_ID_SET } from "./local-toolbox";
import { BB_SPECS } from "./bb-tool-specs";
import { BC_SPECS } from "./bc-tool-specs";
import { BD_SPECS } from "./bd-tool-specs";
import { BJ_SPECS } from "./bj-tool-specs";
import { BK_SPECS } from "./bk-tool-specs";
import { BL_SPECS } from "./bl-tool-specs";

export type LocalTask = Readonly<{
  id: string;
  path: `/tasks/${string}/` | `/tools/${string}/`;
  title: string;
  category: "Costs & conversions" | "Yield & growth" | "Trade & execution" | "Portfolio & performance" | "Staking & vesting" | "Lending & debt" | "Liquidity mathematics" | "Data inspection";
  engineId: string;
  mode: string;
  question: string;
  requiredInputs: readonly string[];
  output: string;
  assumptions: string;
  status: "existing" | "extracted" | "genuinely-new" | "extraction-needed";
  focusLabel?: string;
  preset?: Readonly<{ name: string; value: string }>;
}>;

function task(id: string, title: string, category: LocalTask["category"], engineId: string, mode: string,
  question: string, requiredInputs: readonly string[], output: string, assumptions: string,
  status: LocalTask["status"] = "extracted"): LocalTask {
  if (!LOCAL_TOOL_ID_SET.has(engineId)) throw Error(`Task engine is outside the local allowlist: ${engineId}`);
  return { id, path: `/tasks/${id}/`, title, category, engineId, mode, question, requiredInputs, output, assumptions, status };
}

// A task is one reviewed user question, not an individual output field. Modes
// reuse the original pure calculation and browser adapter; no financial model
// is copied into this catalogue.
const MODE_TASKS: readonly LocalTask[] = [
  task("eth-wei-gwei", "Convert ETH, gwei and wei", "Costs & conversions", "token-fee-converter", "native", "How many wei or gwei are in a stated ETH amount?", ["amount", "unit"], "Exact native-unit equivalents and raw wei", "Unit conversion only; no exchange rate or chain lookup."),
  task("erc20-base-units", "Convert token amount and base units", "Costs & conversions", "token-fee-converter", "token", "What is a token amount in raw base units at stated decimals?", ["tokenLabel", "decimals", "direction", "amount"], "Exact raw or human-readable token amount", "Decimals and label are manual; no token identity is verified."),
  task("rate-units", "Convert percent, bps and ppm", "Costs & conversions", "token-fee-converter", "rate", "How does one rate translate between percent, basis points and ppm?", ["amount", "unit"], "Exact equivalent rate denominations", "A denomination conversion is not an APR/APY conversion."),
  task("stated-fee", "Apply a stated fee rate", "Costs & conversions", "token-fee-converter", "fee", "What fee and remaining amount follow from a manual rate?", ["amount", "decimals", "rate", "rateUnit"], "Fee and net token amount in exact base units", "The fee rate is manual and applied once; no venue quote is checked."),
  task("apr-to-apy", "Convert nominal APR to APY", "Yield & growth", "yield-growth", "apr-to-apy", "What effective APY follows from a nominal APR and compounding frequency?", ["aprPercent", "periodsPerYear"], "Modeled effective APY", "Constant nominal rate and discrete compounding; no future yield guarantee."),
  task("apy-to-apr", "Convert APY to nominal APR", "Yield & growth", "yield-growth", "apy-to-apr", "What nominal APR corresponds to a stated APY and compounding schedule?", ["apyPercent", "periodsPerYear"], "Bounded inverse nominal APR", "A deterministic inverse within documented precision; rates are assumptions."),
  task("annualize-periodic-return", "Annualize a periodic return", "Yield & growth", "yield-growth", "periodic-to-annual", "What annualized return follows if one period return repeats?", ["periodicPercent", "periodsPerYear"], "Modeled annualized return", "Repeated constant period return is illustrative, not observed performance."),
  task("simple-interest", "Calculate simple-interest growth", "Yield & growth", "yield-growth", "simple", "What is a future value under simple interest?", ["principal", "annualRatePercent", "years", "currency"], "Starting principal, modeled growth and future value", "Whole years, one manual currency, no compounding or taxes."),
  task("compound-growth", "Calculate compound growth", "Yield & growth", "yield-growth", "compound", "What future value follows from discrete compounding?", ["principal", "nominalAprPercent", "periodsPerYear", "years", "currency"], "Modeled growth and future value", "Whole periods and fixed nominal APR; no prediction."),
  task("recurring-contributions", "Model recurring contributions", "Yield & growth", "yield-growth", "contributions", "How does beginning versus end contribution timing change growth?", ["principal", "contribution", "nominalAprPercent", "periodsPerYear", "years", "timing", "currency"], "Principal, contributions, growth and ending value", "Fixed manual rate and whole periods; contribution timing is explicit."),
  task("income-principal", "Estimate principal for annual income", "Yield & growth", "yield-growth", "required-principal", "What principal would a stated income require at an assumed APY?", ["annualIncome", "effectiveApyPercent", "currency"], "Conservatively rounded required principal", "Assumed APY is not guaranteed income or a recommendation."),
  task("loss-recovery", "Calculate gain needed after a loss", "Yield & growth", "yield-growth", "recovery", "What gain would restore a value after a percentage loss?", ["lossPercent"], "Required recovery gain or unreachable status", "Price-only arithmetic; fees and new capital are excluded."),
  task("average-entry", "Calculate weighted average entry", "Trade & execution", "trade-risk", "average", "What was the fee-adjusted entry across manual spot fills?", ["fills", "baseDecimals", "quoteDecimals", "exitFeeBps", "exitFixedFeeQuote"], "Gross and adjusted average entry and break-even exit", "Long-only spot; fees must share the quote unit; not tax cost basis."),
  task("stop-risk-size", "Size a long-only stop scenario", "Trade & execution", "trade-risk", "risk", "What quantity fits a stated modeled stop-loss budget?", ["entryPrice", "stopPrice", "quantity", "lossBudgetQuote", "baseDecimals", "quoteDecimals", "fees"], "Modeled loss and conservatively bounded quantity", "A stop may execute at a worse price; not maximum real-world loss."),
  task("risk-reward", "Compare modeled risk and reward", "Trade & execution", "trade-risk", "reward", "What is net target reward relative to modeled stop loss?", ["entryPrice", "stopPrice", "targetPrice", "quantity", "fees"], "Net reward, loss and reward-to-risk ratio", "Manual long-only prices; no fill or target outcome is guaranteed."),
  task("bid-ask-spread", "Measure bid–ask spread", "Trade & execution", "execution-math", "spread", "How wide is a manual bid–ask spread relative to its midpoint?", ["bid", "ask", "referencePrice", "executionPrice", "quoteDecimals"], "Midpoint, absolute spread and execution deviation", "Entered prices are not live quotes; spread differs from slippage."),
  task("slippage-bounds", "Calculate slippage bounds", "Trade & execution", "execution-math", "slippage", "What minimum receive or maximum spend follows from a tolerance?", ["expectedAmount", "tokenDecimals", "direction", "toleranceBps"], "Conservatively rounded token-base-unit bound", "Manual expected amount; no executable quote or transaction."),
  task("gas-budget", "Estimate a transaction gas budget", "Costs & conversions", "execution-math", "gas", "What native-token gas cost follows from gas units and gwei?", ["transactionGasUnits", "gasPriceGwei", "approvalRequired", "budgetNative", "coverage"], "Wei cost, native cost and maximum supported gas price", "No live gas, L2 data fee or execution success is inferred."),
  task("target-rebalance", "Plan a target allocation", "Portfolio & performance", "portfolio-rebalance", "target", "What ideal value trades approach a manual target allocation?", ["buckets", "targetBps", "currencyLabel", "feeBps"], "Drift, desired values and fee-free turnover", "Complete manual valuations and targets summing to 100%; no orders."),
  task("contribution-rebalance", "Rebalance using contributions only", "Portfolio & performance", "portfolio-rebalance", "contribution", "Can a cash contribution reach a target without selling?", ["buckets", "targetBps", "contribution", "currencyLabel"], "Feasibility, allocations and minimum needed contribution", "No sales, same manual currency, complete included buckets only."),
  task("portfolio-shock", "Model a portfolio shock", "Portfolio & performance", "portfolio-rebalance", "shock", "How would manual bucket shocks change included portfolio value?", ["buckets", "shockBps", "currencyLabel"], "Projected values, gain/loss and new weights", "Shocks have no probability and do not forecast market prices."),
  task("flow-adjusted-performance", "Analyze performance with cash flows", "Portfolio & performance", "performance-drawdown", "performance", "How did manual portfolio values perform after external flows?", ["snapshots", "dates", "externalFlow", "currencyLabel"], "Nominal gain and chained time-weighted return", "Flows occur at each interval end; missing valuation boundaries cannot be reconstructed."),
  task("flow-adjusted-drawdown", "Analyze drawdown and recovery", "Portfolio & performance", "performance-drawdown", "drawdown", "How far did a flow-neutral performance index fall from its peak?", ["snapshots", "dates", "externalFlow", "currencyLabel"], "Maximum/current drawdown, peak, trough and recovery status", "Uses manual dated snapshots, not raw balances or a risk forecast."),
  task("staking-reward-projection", "Project simple staking rewards", "Staking & vesting", "staking-rewards", "projection", "What gross and commission-adjusted rewards follow from an assumed APR?", ["stake", "grossAprBps", "elapsedDays", "commissionBps", "decimals"], "Gross reward, commission and net token reward", "ACT/365 simple accrual; an assumed APR is not live protocol yield."),
  task("claim-economics", "Check modeled claim economics", "Staking & vesting", "staking-rewards", "claim", "Would a manual reward balance exceed known claim costs?", ["grossReward", "commissionCoverage", "claimFee", "feeDenomination", "decimals"], "Net claim value and break-even reward threshold", "Unconverted native fees make coverage incomplete; no on-chain claimability is checked."),
  task("restaking-scenario", "Compare restaking and penalties", "Staking & vesting", "staking-rewards", "restake", "How would same-asset restaking and a hypothetical slash change principal?", ["stake", "grossAprBps", "periodsPerYear", "commissionBps", "slashBps"], "Modeled principal, rewards, costs and ending value", "Same-asset assumption must be explicit; slashing and returns are hypothetical."),
  task("linear-vesting", "Calculate linear vesting with cliff", "Staking & vesting", "vesting-unlocks", "linear", "How much allocation is modeled unlocked at a supplied UTC date?", ["totalAllocation", "startDate", "endDate", "cliffDate", "observationDate", "decimals"], "Unlocked, locked and manually unreceived token amounts", "Cliff releases accrued amount; no contract or actual claim status is read."),
  task("initial-unlock-vesting", "Model initial unlock and linear vesting", "Staking & vesting", "vesting-unlocks", "initial-linear", "What is unlocked after an initial share and later linear vesting?", ["totalAllocation", "initialUnlockBps", "startDate", "endDate", "observationDate"], "Initial, subsequent, total unlocked and locked amounts", "Initial share is counted once; UTC schedule and token identity are manual."),
  task("tranche-unlocks", "Review dated token unlock tranches", "Staking & vesting", "vesting-unlocks", "tranches", "Which scheduled tranches are unlocked and what comes next?", ["totalAllocation", "tranches", "observationDate", "decimals"], "Cumulative unlocked, locked and next listed tranche", "Tranche totals must conserve the allocation; no on-chain evidence."),
  task("collateral-health-factor", "Calculate collateral health and headroom", "Lending & debt", "collateral-health", "health", "What modeled LTV, health factor and borrow headroom follow from manual values?", ["collateralValue", "debtValue", "maxLtvBps", "liquidationThresholdBps", "targetHealthFactor"], "LTV, health factor and constrained debt headroom", "Single collateral and debt in one manual quote currency; no protocol rules checked."),
  task("collateral-adjustment", "Model repay, add and withdraw limits", "Lending & debt", "collateral-health", "adjust", "What value-only change would meet selected LTV and health constraints?", ["collateralValue", "debtValue", "maxLtvBps", "liquidationThresholdBps", "targetHealthFactor"], "Conservative repay/addition/withdrawal limits", "These are quote values, not executable token quantities or guaranteed safety."),
  task("collateral-shock", "Stress a single collateral value", "Lending & debt", "collateral-health", "shock", "How would a stated collateral shock change modeled LTV and health?", ["collateralValue", "debtValue", "collateralShockBps", "liquidationThresholdBps"], "Shocked LTV, health factor and fixed-debt buffer", "Debt value and protocol thresholds are held constant."),
  task("debt-growth", "Compare simple and compounded debt", "Lending & debt", "borrowing-cost", "growth", "How might manual debt grow under two explicit interest schedules?", ["principal", "borrowAprBps", "elapsedDays", "elapsedPeriods", "periodsPerYear"], "Simple and compound financing cost and final debt", "Fixed nominal APR; entered horizons must describe the intended comparison."),
  task("repayment-schedule", "Model fixed debt repayments", "Lending & debt", "borrowing-cost", "repayment", "How does an end-of-period payment split between interest and principal?", ["principal", "borrowAprBps", "fixedPayment", "periodsPerYear", "horizonPeriods"], "Period interest, principal reduction and payoff status", "Fixed rate and end-of-period payments; no variable-rate forecast."),
  task("borrowed-capital-carry", "Compare manual yield and borrowing cost", "Lending & debt", "borrowing-cost", "carry", "Would an assumed investment return exceed known financing costs?", ["principal", "borrowAprBps", "investmentYieldBps", "elapsedDays", "costCoverage"], "Earnings, borrowing cost and coverage-aware net carry", "One manual currency; unknown expenses withhold a net-profit conclusion."),
  task("amm-reserve-price", "Read an AMM reserve-implied price", "Liquidity mathematics", "amm-pool-math", "reserves", "What marginal price and invariant follow from manual pool reserves?", ["reserve0", "reserve1", "decimals0", "decimals1"], "Forward/reverse price and reserve product", "Constant-product illustration, not live liquidity or a swap quote."),
  task("amm-swap-output", "Simulate a constant-product swap", "Liquidity mathematics", "amm-pool-math", "swap", "What output and reserve impact follow from a manual exact-input swap?", ["reserve0", "reserve1", "amountIn", "direction", "feeBps"], "Rounded output, fee, impact and post-swap reserves", "Pool fee differs from PIT fee; no gas, MEV or executable quote."),
  task("amm-proportional-liquidity", "Model proportional pool liquidity", "Liquidity mathematics", "amm-pool-math", "liquidity", "What paired deposit or withdrawal preserves a pool reserve ratio?", ["reserve0", "reserve1", "deposit0", "available1", "withdrawBps"], "Required pair, post-reserves, share and withdrawal quantities", "Fee-free illustrative ownership, not protocol LP minting."),
  task("cl-position-composition", "Inspect concentrated position composition", "Liquidity mathematics", "concentrated-liquidity", "composition", "How much of each token lies in a chosen concentrated price range?", ["price", "lowerPrice", "upperPrice", "budget0", "budget1"], "Modeled token amounts, liquidity and unspent budgets", "Continuous fee-free range model, not Uniswap v3 contract-equivalent."),
  task("cl-price-scenario", "Compare LP and HODL at another price", "Liquidity mathematics", "concentrated-liquidity", "scenario", "How does the same initial position compare with holding at a future price?", ["initialPrice", "futurePrice", "lowerPrice", "upperPrice", "budgets"], "LP value, matched HODL value and relative divergence", "No fee prediction; a negative relative difference is not necessarily absolute loss."),
  task("cl-fee-break-even", "Check concentrated LP fee break-even", "Liquidity mathematics", "concentrated-liquidity", "fees", "What manually accrued fees cover modeled LP-versus-HODL divergence?", ["initialPrice", "futurePrice", "accruedFee0", "accruedFee1", "costCoverage"], "Break-even fees and coverage-aware net comparison", "Unknown costs prevent definitive profit assessment; no volume forecast."),
  task("evm-address-checksum", "Validate an EVM address checksum", "Data inspection", "evm-data-inspector", "address", "Is a supplied 20-byte address syntactically valid and EIP-55 checksummed?", ["address"], "Checksummed and lowercase address with checksum status", "Syntax or checksum does not verify recipient, contract or chain identity."),
  task("evm-signature-hash", "Derive an ABI selector or event topic", "Data inspection", "evm-data-inspector", "signature", "What Keccak selector or topic follows from a canonical signature?", ["signature", "kind"], "Four-byte selector or event topic0", "No remote signature lookup; unsupported signatures are rejected."),
  task("abi-calldata-decode", "Decode bounded ABI calldata", "Data inspection", "evm-data-inspector", "decode", "Which supplied ABI function and static arguments match calldata?", ["abi", "calldata"], "Matched selector and safely rendered decoded arguments", "Decode only; no contract call, execution or security verdict."),
  task("csv-structure-inspect", "Inspect a local CSV structure", "Data inspection", "crypto-data-workshop", "inspect", "Are local CSV rows structurally valid and complete?", ["csvText", "delimiter", "headerChoice"], "Row/column counts, bounded preview and validation issues", "Local file/text only; ambiguous delimiters require explicit choice."),
  task("csv-normalize-preview", "Normalize mapped CSV fields", "Data inspection", "crypto-data-workshop", "normalize", "How do explicitly mapped fields normalize without guessing units or dates?", ["csvText", "columnMapping", "decimalPrecision", "timestampFormat"], "Preview, normalized strings and invalid-field report", "No tax categorization, silent rounding or storage write."),
  task("csv-deduplicate-export", "Review CSV duplicate groups", "Data inspection", "crypto-data-workshop", "dedupe", "Which rows share selected identity columns and need review?", ["csvText", "identityColumns", "keepExcludeDecisions"], "Duplicate/conflict groups and local reviewed exports", "Matching amount/time alone does not prove the same blockchain event."),
];

function focus(id: string, title: string, baseId: string, question: string, output: string,
  focusLabel: string, preset?: LocalTask["preset"]): LocalTask {
  const base = MODE_TASKS.find((entry) => entry.id === baseId);
  if (!base) throw Error(`Unknown base task: ${baseId}`);
  return { ...base, id, path: `/tasks/${id}/`, title, question, output, focusLabel, ...(preset ? { preset } : {}) };
}

// These narrower tasks emphasize independently meaningful outputs of reviewed
// engines. A focused field is copied as inert text from the existing result;
// all calculation, validation, rounding and JSON export remain in that engine.
const FOCUSED_TASKS: readonly LocalTask[] = [
  focus("purchase-acquisition-cost", "Total cost of spot purchases", "average-entry", "What quote amount did the entered spot fills cost before exit?", "Gross acquisition cost", "Gross acquisition cost"),
  focus("fee-aware-break-even", "Fee-aware break-even exit", "average-entry", "What exit price would cover entered acquisition and exit fees?", "Minimum break-even exit price", "Minimum break-even exit price"),
  focus("planned-stop-distance", "Distance to a planned stop", "stop-risk-size", "How far is a manual long-only stop below entry?", "Absolute entry-to-stop price distance", "Entry-to-stop distance"),
  focus("modeled-stop-loss", "Modeled loss at a stated stop", "stop-risk-size", "What loss follows if the supplied stop executes at that exact price?", "Fee-aware modeled stop loss", "Modeled loss at stated stop"),
  focus("net-target-payoff", "Net payoff at a target price", "risk-reward", "What quote payoff remains at a manual target after stated fees?", "Net target payoff", "Net payoff at stated target"),
  focus("bid-ask-midpoint", "Find a bid–ask midpoint", "bid-ask-spread", "What midpoint lies between the entered bid and ask?", "Bid/ask midpoint", "Bid/ask midpoint"),
  focus("execution-reference-deviation", "Measure execution-price deviation", "bid-ask-spread", "How far does an observed execution price differ from a stated reference?", "Deviation relative to reference price", "Deviation vs reference"),
  focus("maximum-input-bound", "Set a maximum input bound", "slippage-bounds", "What maximum token spend follows from an exact-output tolerance?", "Ceiling-rounded maximum spend", "Maximum spend", { name: "direction", value: "exact-output" }),
  focus("maximum-gas-price", "Find a budget-supported gas price", "gas-budget", "What highest gwei price fits the stated native-token gas budget?", "Conservatively rounded maximum gas price", "Budget-supported maximum gas price"),
  focus("rebalance-turnover", "Measure ideal rebalance turnover", "target-rebalance", "What one-way traded value would a fee-free target plan imply?", "One-way ideal turnover", "One-way ideal turnover"),
  focus("rebalance-fee-drag", "Estimate rebalance fee drag", "target-rebalance", "What separately stated fee drag applies to a hypothetical target trade plan?", "Separate estimated fee drag", "Separate estimated fee drag; target remains pre-fee"),
  focus("minimum-contribution", "Minimum contribution without selling", "contribution-rebalance", "What smallest additional manual-currency contribution can reach the targets?", "Minimum no-sale contribution", "Minimum smallest-unit contribution without selling"),
  focus("shock-concentration", "Concentration after a portfolio shock", "portfolio-shock", "How does the largest modeled bucket weight change after manual shocks?", "Largest projected bucket weight", "Largest projected bucket weight"),
  focus("flow-neutral-monetary-gain", "Gain excluding external deposits", "flow-adjusted-performance", "What nominal gain or loss remains after removing deposits and withdrawals?", "Monetary gain/loss excluding external flows", "Monetary gain/loss excluding external flows"),
  focus("best-observed-period", "Best observed portfolio period", "flow-adjusted-performance", "Which entered interval had the highest flow-adjusted return?", "Highest observed period return", "Highest observed period return"),
  focus("worst-observed-period", "Worst observed portfolio period", "flow-adjusted-performance", "Which entered interval had the lowest flow-adjusted return?", "Lowest observed period return", "Lowest observed period return"),
  focus("current-portfolio-drawdown", "Current flow-neutral drawdown", "flow-adjusted-drawdown", "How far below its previous modeled peak is the series now?", "Current drawdown", "Current drawdown"),
  focus("flow-neutral-index", "Flow-neutral closing index", "flow-adjusted-drawdown", "What normalized closing index follows after removing external flows?", "Flow-neutral closing index", "Flow-neutral closing index (opening = 1)"),
  focus("gross-staking-rewards", "Gross rewards from stated staking APR", "staking-reward-projection", "What token rewards accrue before validator commission?", "Gross modeled token rewards", "Gross modeled rewards"),
  focus("validator-commission", "Validator commission on rewards", "staking-reward-projection", "What part of modeled gross rewards goes to a stated validator commission?", "Validator commission in reward-token units", "Validator commission"),
  focus("claim-reward-threshold", "Reward balance needed to cover claim cost", "claim-economics", "What gross reward balance covers known claim cost and commission?", "Minimum gross reward threshold", "Minimum gross to cover known cost"),
  focus("claim-wait-days", "Modeled days to cover claim cost", "claim-economics", "How many whole days of stated constant accrual cover known claim cost?", "Whole-day break-even wait", "Whole days to cover known cost"),
  focus("slash-adjusted-principal", "Principal after a hypothetical slash", "restaking-scenario", "How much original principal remains after a manual slash percentage?", "Principal after slash", "Principal after slash"),
  focus("restaked-net-growth", "Growth after restaking costs", "restaking-scenario", "What same-asset restaking growth remains after known periodic costs?", "Restaked growth after costs", "Restaked growth after costs"),
  focus("vested-unreceived", "Vested but not yet received tokens", "linear-vesting", "How much modeled vested allocation remains after a manual received amount?", "Vested but not yet received token amount", "Vested but not yet received under manual inputs"),
  focus("initial-unlock-share", "Initial token unlock amount", "initial-unlock-vesting", "How many tokens unlock at the stated vesting start?", "Initial unlock scheduled at start", "Initial unlock scheduled at start"),
  focus("collateral-equity", "Collateral equity after debt", "collateral-health-factor", "What manual collateral value remains after subtracting debt?", "Collateral equity", "Collateral equity"),
  focus("collateral-gross-leverage", "Gross collateral exposure over equity", "collateral-health-factor", "What simple gross-exposure leverage follows from valued collateral and equity?", "Gross exposure divided by equity", "Gross exposure / equity"),
  focus("minimum-debt-repayment", "Minimum debt repayment for target health", "collateral-adjustment", "What conservative debt repayment reaches the selected health target?", "Minimum debt repayment", "Minimum debt repayment"),
  focus("minimum-collateral-addition", "Minimum collateral value to add", "collateral-adjustment", "What conservative collateral-value addition reaches the selected constraints?", "Minimum collateral-value addition", "Minimum collateral value addition"),
  focus("maximum-collateral-withdrawal", "Maximum modeled collateral withdrawal", "collateral-adjustment", "What largest collateral value may be withdrawn within both manual limits?", "Conservative safe withdrawal value", "Maximum safe collateral-value withdrawal"),
  focus("collateral-critical-drop", "Collateral drop to health factor one", "collateral-shock", "What fixed-debt collateral-value decline reaches modeled health factor one?", "Collateral-value drop to HF = 1", "Current collateral-value drop to HF = 1"),
  focus("simple-borrow-interest", "Simple borrowing interest", "debt-growth", "What interest accrues over stated whole days at a nominal borrow APR?", "ACT/365 simple interest", "Simple interest, ACT/365"),
  focus("compounded-final-debt", "Debt after scheduled compounding", "debt-growth", "What debt follows from whole periods of nominal-rate compounding?", "Final compounded debt", "Debt after scheduled compounding"),
  focus("repayment-total-interest", "Interest paid through a modeled schedule", "repayment-schedule", "How much interest accrues over the entered fixed-payment horizon?", "Cumulative modeled interest", "Cumulative modeled interest"),
  focus("carry-break-even-yield", "Yield needed to cover borrowing cost", "borrowed-capital-carry", "What minimum simple yield covers known borrowing and separate costs?", "Minimum break-even yield in whole bps", "Minimum whole-bps simple yield to cover known costs"),
  focus("amm-manual-composition", "Pool composition at a manual price", "amm-reserve-price", "What token0 share follows from a separately stated common-value reference?", "Token0 share at manual reference price", "Token0 share at manual reference price"),
  focus("amm-reserve-impact", "Fee-free AMM reserve impact", "amm-swap-output", "How much does pool depth alone move the swap price before fees?", "Fee-free reserve impact versus marginal spot", "Fee-free reserve impact versus spot"),
  focus("amm-post-swap-price", "AMM price after a modeled swap", "amm-swap-output", "What marginal pool price follows the rounded hypothetical swap?", "Post-swap marginal price", "Post-swap marginal price"),
  focus("amm-new-lp-share", "New LP share of a proportional pool", "amm-proportional-liquidity", "What illustrative pool share follows from a proportional deposit?", "New-provider pool ownership share", "Illustrative new LP share"),
  focus("cl-unused-token-budget", "Unspent token budget in a price range", "cl-position-composition", "How much of the supplied token1 budget remains outside the modeled position?", "Unused token1 budget", "Unused token1"),
  focus("cl-fees-including-costs", "LP fees needed after known costs", "cl-fee-break-even", "What accrued fees would cover divergence plus stated management cost?", "Break-even fees including known costs", "Break-even fees including costs"),
];

const EXISTING_STANDALONE_TASKS: readonly LocalTask[] = [
  { id: "pnl", path: "/tools/pnl/", title: "Trade PnL Calculator", category: "Portfolio & performance", engineId: "pnl", mode: "single", question: "What signed gain or loss follows from a manual entry, exit, size and fees?", requiredInputs: ["entryPrice", "exitPrice", "quantity", "fees"], output: "Signed trade profit or loss", assumptions: "Manual spot-style prices; no tax cost-basis or live trade data.", status: "existing" },
  { id: "swap-cost", path: "/tools/swap-cost/", title: "Swap Cost Simulator", category: "Costs & conversions", engineId: "swap-cost", mode: "single", question: "Which of two manual swap scenarios has lower modeled total cost?", requiredInputs: ["routes", "feeCoverage", "gas", "sourceBudget"], output: "Coverage-aware route comparison", assumptions: "No executable quote, wallet call, live gas or guaranteed settlement.", status: "existing" },
  { id: "bridge-cost", path: "/tools/bridge-cost/", title: "Bridge Cost Comparator", category: "Costs & conversions", engineId: "bridge-cost", mode: "single", question: "Which hypothetical cross-chain route delivers more modeled destination value?", requiredInputs: ["sourceAsset", "destinationAsset", "routes", "fees", "gas"], output: "Coverage-aware destination-value comparison", assumptions: "Chain labels do not prove provider support or asset redeemability.", status: "existing" },
  { id: "portfolio-exposure", path: "/tools/portfolio-exposure/", title: "Portfolio Exposure Analyzer", category: "Portfolio & performance", engineId: "portfolio-exposure", mode: "single", question: "How are manually valued spot holdings allocated and concentrated?", requiredInputs: ["positions", "manualPrices", "priceTimestamps"], output: "Known subtotal, exposure groups, concentration and coverage", assumptions: "Unknown prices never become zero; not a wallet scanner or risk score.", status: "existing" },
  { id: "liquidation", path: "/tools/liquidation/", title: "Generic Liquidation Price", category: "Lending & debt", engineId: "liquidation", mode: "single", question: "At what manual isolated-position price does a stated maintenance threshold occur?", requiredInputs: ["entryPrice", "positionSize", "margin", "maintenanceThreshold"], output: "Modeled threshold price", assumptions: "Generic arithmetic, not protocol liquidation rules or execution guarantee.", status: "existing" },
  { id: "impermanent-loss", path: "/tools/impermanent-loss/", title: "50/50 Pool Impermanent Loss", category: "Liquidity mathematics", engineId: "impermanent-loss", mode: "single", question: "How does a fee-free 50/50 constant-product position compare with holding?", requiredInputs: ["startingPrice", "endingPrice"], output: "Illustrative LP-versus-HODL divergence", assumptions: "Excludes fees, gas, concentrated liquidity and live pool data.", status: "existing" },
];

const BB_TASKS: readonly LocalTask[] = BB_SPECS.map((spec) => ({
  id: spec.id, path: `/tasks/${spec.id}/`, title: spec.title,
  category: spec.category as LocalTask["category"], engineId: "bb-derivatives", mode: spec.id,
  question: spec.question, requiredInputs: spec.fields.map((field) => field.name),
  output: spec.output, assumptions: spec.assumptions, status: "genuinely-new",
}));
const BC_TASKS: readonly LocalTask[] = BC_SPECS.map((spec) => ({
  id: spec.id, path: `/tasks/${spec.id}/`, title: spec.title,
  category: spec.category as LocalTask["category"], engineId: "bc-statistics", mode: spec.id,
  question: spec.question, requiredInputs: spec.fields.map((field) => field.name),
  output: spec.output, assumptions: spec.assumptions, status: "genuinely-new",
}));
const BD_TASKS: readonly LocalTask[] = BD_SPECS.map((spec) => ({
  id: spec.id, path: `/tasks/${spec.id}/`, title: spec.title,
  category: spec.category as LocalTask["category"], engineId: "bd-defi-evm", mode: spec.id,
  question: spec.question, requiredInputs: spec.fields.map((field) => field.name),
  output: spec.output, assumptions: spec.assumptions, status: "genuinely-new",
}));
const BJ_TASKS: readonly LocalTask[] = BJ_SPECS.map((spec) => ({
  id: spec.id, path: `/tasks/${spec.id}/`, title: spec.title,
  category: spec.category, engineId: "bb-derivatives", mode: spec.id,
  question: spec.question, requiredInputs: spec.fields.map(field => field.name),
  output: spec.output, assumptions: spec.assumptions, status: "genuinely-new",
}));
const BK_TASKS: readonly LocalTask[] = BK_SPECS.map((spec) => ({
  id: spec.id, path: `/tasks/${spec.id}/`, title: spec.title,
  category: spec.category, engineId: "bc-statistics", mode: spec.id,
  question: spec.question, requiredInputs: spec.fields.map(field => field.name),
  output: spec.output, assumptions: spec.assumptions, status: "genuinely-new",
}));
const BL_TASKS: readonly LocalTask[] = BL_SPECS.map((spec) => ({
  id: spec.id, path: `/tasks/${spec.id}/`, title: spec.title,
  category: spec.category, engineId: "bd-defi-evm", mode: spec.id,
  question: spec.question, requiredInputs: spec.fields.map(field => field.name),
  output: spec.output, assumptions: spec.assumptions, status: "genuinely-new",
}));
export const LOCAL_TASK_INVENTORY: readonly LocalTask[] = [...EXISTING_STANDALONE_TASKS, ...MODE_TASKS, ...FOCUSED_TASKS, ...BB_TASKS, ...BC_TASKS, ...BD_TASKS, ...BJ_TASKS, ...BK_TASKS, ...BL_TASKS];
export const AVAILABLE_LOCAL_TASKS = LOCAL_TASK_INVENTORY.filter((entry) => entry.status === "extracted" || entry.status === "genuinely-new");
export const COMPLETED_LOCAL_TASKS = LOCAL_TASK_INVENTORY.filter((entry) => entry.status !== "extraction-needed");
export const PENDING_LOCAL_TASKS = LOCAL_TASK_INVENTORY.filter((entry) => entry.status === "extraction-needed");
const ids = LOCAL_TASK_INVENTORY.map((entry) => entry.id);
if (new Set(ids).size !== ids.length || LOCAL_TASK_INVENTORY.some((entry) => entry.path !== (entry.status === "existing" ? `/tools/${entry.id}/` : `/tasks/${entry.id}/`)))
  throw Error("Local task inventory has duplicate or unstable paths");
