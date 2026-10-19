/** Browser-only adapters; no persistence, network, wallet or accounting imports. */
import { download, input, number, render, setSample } from "./al-browser";
import { runAmTool } from "./am-tool-contracts";
import { ammReportJSON, type AmmInput, type AmmResult } from "./amm-pool-math";
import {
  concentratedReportJSON,
  type ClInput,
  type ClResult,
} from "./concentrated-liquidity";

const labels: Record<string, string> = {
  reserve0: "Token0 reserve",
  reserve1: "Token1 reserve",
  spotToken1PerToken0: "Spot marginal price",
  reverseToken0PerToken1: "Reverse marginal price",
  invariantRawProduct: "Reserve product",
  token0CommonValue: "Token0 reference value",
  token1CommonValue: "Token1 reference value",
  token0Composition: "Token0 share at manual reference price",
  inputAmount: "Supplied input",
  effectiveInput: "Input after pool fee",
  poolFeeRetained: "Fee retained by pool",
  hypotheticalOutput: "Modeled output",
  feeFreeOutput: "Modeled output without fee",
  averageExecutionPrice: "Average execution price",
  feeFreeReserveImpact: "Fee-free reserve impact versus spot",
  feeInclusiveDeviation: "Fee-inclusive deviation versus spot",
  postInputReserve: "Post-swap input reserve",
  postOutputReserve: "Post-swap output reserve",
  postInvariantRawProduct: "Post-swap reserve product",
  postMarginalPrice: "Post-swap marginal price",
  requiredPairedToken1ForDesiredToken0:
    "Token1 required for full desired token0 amount",
  usedToken0: "Used token0",
  usedToken1: "Used token1",
  unusedToken0: "Unused token0",
  unusedToken1: "Unused token1",
  postDepositReserve0: "Reserve0 after deposit",
  postDepositReserve1: "Reserve1 after deposit",
  newProviderShare: "Illustrative new LP share",
  withdrawToken0: "Withdraw token0",
  withdrawToken1: "Withdraw token1",
  postWithdrawalReserve0: "Reserve0 after withdrawal",
  postWithdrawalReserve1: "Reserve1 after withdrawal",
  liquidityParameter: "Derived illustrative liquidity L",
  initialToken0: "Initially used token0",
  initialToken1: "Initially used token1",
  initialValue: "Initial position value",
  futureToken0: "Future token0 composition",
  futureToken1: "Future token1 composition",
  futureLpValue: "Future LP value",
  futureHodlValue: "Future HODL value",
  lpMinusHodl: "LP minus HODL",
  lpVsHodlFraction: "LP versus HODL fraction",
  statedAccruedFeeValue: "Stated fees valued in token1",
  feeRequirementBeforeCosts: "Break-even fees before costs",
  knownManagementCost: "Known management cost",
  feeRequirementIncludingCosts: "Break-even fees including costs",
  netLpMinusHodl: "Net LP minus HODL",
};
const setup = (root: HTMLElement) => {
  const form = root.querySelector<HTMLFormElement>("form")!;
  const mode = root.querySelector<HTMLSelectElement>("[data-mode]")!;
  const error = root.querySelector<HTMLElement>("[data-error]")!;
  const invalidate = () => {
    root.querySelector<HTMLElement>("[data-result]")!.hidden = true;
    error.hidden = true;
    error.textContent = "";
  };
  const showMode = () => {
    for (const panel of root.querySelectorAll<HTMLElement>("[data-panel]"))
      panel.hidden = panel.dataset.panel !== mode.value;
    invalidate();
  };
  mode.addEventListener("change", showMode);
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  const fail = (cause: unknown) => {
    error.textContent =
      cause instanceof Error ? cause.message : "Invalid manual scenario.";
    error.hidden = false;
  };
  return { form, mode, showMode, fail };
};
export function mountAmm(root: HTMLElement) {
  const { form, mode, showMode, fail } = setup(root);
  let current: AmmResult | null = null;
  root
    .querySelector<HTMLButtonElement>("[data-sample]")!
    .addEventListener("click", () => {
      setSample(form, {
        token0: "TokenA",
        token1: "TokenB",
        decimals0: "6",
        decimals1: "6",
        reserve0: "100",
        reserve1: "10000",
        commonValuePrice: "100",
        direction: "zero-to-one",
        amountIn: "10",
        feeBps: "0",
        deposit0: "10",
        available1: "1000",
        withdrawBps: "1000",
      });
      showMode();
    });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    current = null;
    try {
      const common = {
        token0: input(form, "token0"),
        token1: input(form, "token1"),
        decimals0: number(form, "decimals0"),
        decimals1: number(form, "decimals1"),
        reserve0: input(form, "reserve0"),
        reserve1: input(form, "reserve1"),
      };
      let value: AmmInput;
      if (mode.value === "reserves")
        value = {
          ...common,
          mode: "reserves",
          commonValuePrice: input(form, "commonValuePrice"),
        };
      else if (mode.value === "swap")
        value = {
          ...common,
          mode: "swap",
          direction: input(form, "direction") as AmmInput["direction"],
          amountIn: input(form, "amountIn"),
          feeBps: input(form, "feeBps"),
        };
      else if (mode.value === "liquidity")
        value = {
          ...common,
          mode: "liquidity",
          deposit0: input(form, "deposit0"),
          available1: input(form, "available1"),
          withdrawBps: input(form, "withdrawBps"),
        };
      else throw Error("Unsupported mode.");
      const result = runAmTool("amm-pool-math", value);
      if (result.status === "ERROR") throw Error(result.error.message);
      current = result.output;
      render(
        root,
        {
          status: "complete",
          reasons: [],
          fields: current.fields,
          limitations: current.limitations,
        },
        mode.value === "swap"
          ? "hypotheticalOutput"
          : mode.value === "liquidity"
            ? "newProviderShare"
            : "spotToken1PerToken0",
        labels,
      );
    } catch (cause) {
      fail(cause);
    }
  });
  root
    .querySelector<HTMLButtonElement>("[data-download]")!
    .addEventListener("click", () => {
      if (current) download("pit-amm-pool-math.json", ammReportJSON(current));
    });
}
export function mountConcentrated(root: HTMLElement) {
  const { form, mode, showMode, fail } = setup(root);
  let current: ClResult | null = null;
  root
    .querySelector<HTMLButtonElement>("[data-sample]")!
    .addEventListener("click", () => {
      setSample(form, {
        token0: "TokenA",
        token1: "TokenB",
        decimals0: "6",
        decimals1: "6",
        lowerPrice: "0.25",
        upperPrice: "4",
        initialPrice: "1",
        futurePrice: "4",
        budget0: "50",
        budget1: "50",
        accruedFee0: "0",
        accruedFee1: "0",
        managementCost1: "5",
        costCoverage: "known",
      });
      showMode();
    });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    current = null;
    try {
      const common = {
        token0: input(form, "token0"),
        token1: input(form, "token1"),
        decimals0: number(form, "decimals0"),
        decimals1: number(form, "decimals1"),
        lowerPrice: input(form, "lowerPrice"),
        upperPrice: input(form, "upperPrice"),
        initialPrice: input(form, "initialPrice"),
        futurePrice: input(form, "futurePrice"),
        budget0: input(form, "budget0"),
        budget1: input(form, "budget1"),
      };
      let value: ClInput;
      if (mode.value === "composition" || mode.value === "scenario")
        value = { ...common, mode: mode.value };
      else if (mode.value === "fees")
        value = {
          ...common,
          mode: "fees",
          accruedFee0: input(form, "accruedFee0"),
          accruedFee1: input(form, "accruedFee1"),
          managementCost1: input(form, "managementCost1"),
          costCoverage: input(form, "costCoverage") as ClInput["costCoverage"],
        };
      else throw Error("Unsupported mode.");
      const result = runAmTool("concentrated-liquidity", value);
      if (result.status === "ERROR") throw Error(result.error.message);
      current = result.output;
      render(
        root,
        current,
        mode.value === "fees"
          ? "feeRequirementIncludingCosts"
          : mode.value === "scenario"
            ? "lpMinusHodl"
            : "initialValue",
        labels,
      );
      root.querySelector<HTMLElement>("[data-region]")!.textContent =
        `Initial: ${current.initialRegion}; scenario: ${current.futureRegion}. At exact bounds, these labels describe composition, not on-chain active-tick status.`;
    } catch (cause) {
      fail(cause);
    }
  });
  root
    .querySelector<HTMLButtonElement>("[data-download]")!
    .addEventListener("click", () => {
      if (current)
        download(
          "pit-concentrated-liquidity.json",
          concentratedReportJSON(current),
        );
    });
}
