/** Closed Phase AM pure-local adapters. Manual token labels never establish identity. */
import { AiInputError } from "./ai-math";
import {
  calculateAmm,
  AMM_VERSION,
  type AmmInput,
  type AmmResult,
} from "./amm-pool-math";
import {
  calculateConcentrated,
  CL_VERSION,
  type ClInput,
  type ClResult,
} from "./concentrated-liquidity";
import { localToolById } from "./local-tool-definitions";
import type {
  PureToolContract,
  ToolPort,
  ToolRunResult,
  ToolUnit,
  ToolValue,
} from "./pure-tool-contract";

class ShapeError extends Error {
  readonly name = "ShapeError";
}
type Id = "amm-pool-math" | "concentrated-liquidity";
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const shape = (x: unknown, strings: string[], numbers: string[]) => {
  if (!object(x)) throw new ShapeError("Input must be an object.");
  const keys = ["mode", ...strings, ...numbers];
  if (
    Object.keys(x).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(x, k))
  )
    throw new ShapeError("Input has missing or unsupported fields.");
  for (const k of strings)
    if (typeof x[k] !== "string") throw new ShapeError(`${k} must be text.`);
  for (const k of numbers)
    if (!Number.isSafeInteger(x[k]))
      throw new ShapeError(`${k} must be a safe whole number.`);
  return x;
};
const common = ["token0", "token1", "reserve0", "reserve1"];
const prices = [
  "token0",
  "token1",
  "lowerPrice",
  "upperPrice",
  "initialPrice",
  "futurePrice",
  "budget0",
  "budget1",
];
const port = (id: Id, name: string, unit: ToolUnit): ToolPort => ({
  name,
  unit,
  valueType: "raw-integer-string",
  required: true,
  sourceToolId: id,
  sourceContractVersion: 1,
});
const manual = (label: string, decimals: number): ToolUnit => ({
  kind: "token",
  decimals,
  identity: { kind: "manual-label", label: label.toLowerCase() },
});
const validFields = (fields: unknown) =>
  Array.isArray(fields) &&
  fields.length > 0 &&
  fields.every(
    (f) =>
      object(f) &&
      typeof f.name === "string" &&
      typeof f.raw === "string" &&
      /^-?(?:0|[1-9]\d*)$/.test(f.raw) &&
      typeof f.display === "string" &&
      typeof f.unit === "string" &&
      Number.isSafeInteger(f.decimals) &&
      (f.decimals as number) >= 0 &&
      (f.decimals as number) <= 72,
  );
const outputValue = (
  id: Id,
  fields: AmmResult["fields"] | ClResult["fields"],
  name: string,
  unit: ToolUnit,
): ToolValue[] => {
  const found = fields.find((f) => f.name === name);
  return found ? [{ port: port(id, name, unit), value: found.raw }] : [];
};
export const ammPoolContract: PureToolContract<AmmInput, AmmResult> = {
  id: "amm-pool-math",
  version: 1,
  title: localToolById("amm-pool-math").title,
  category: localToolById("amm-pool-math").category,
  capability: "local-pure",
  assumptions: ["Manual constant-product reserves and fee."],
  limitations: [
    "No executable swap, LP token mint or verified asset identity.",
  ],
  validateInput(x) {
    if (!object(x)) throw new ShapeError("AMM input must be an object.");
    if (x.mode === "reserves")
      return shape(
        x,
        [...common, "commonValuePrice"],
        ["decimals0", "decimals1"],
      ) as AmmInput;
    if (x.mode === "swap")
      return shape(
        x,
        [...common, "direction", "amountIn", "feeBps"],
        ["decimals0", "decimals1"],
      ) as AmmInput;
    if (x.mode === "liquidity")
      return shape(
        x,
        [...common, "deposit0", "available1", "withdrawBps"],
        ["decimals0", "decimals1"],
      ) as AmmInput;
    throw new ShapeError("Unsupported AMM mode.");
  },
  calculate: calculateAmm,
  validateOutput(o) {
    if (
      o.calculationVersion !== AMM_VERSION ||
      !validFields(o.fields) ||
      !["reserves", "swap", "liquidity"].includes(o.mode) ||
      o.invariantHumanDecimals !== o.input.decimals0 + o.input.decimals1
    )
      throw Error("AMM output violates v1 shape.");
    const get = (n: string) => o.fields.find((f) => f.name === n)?.raw;
    if (!get("reserve0") || !get("reserve1") || !get("invariantRawProduct"))
      throw Error("AMM reserve values are missing.");
    if (
      BigInt(get("reserve0")!) * BigInt(get("reserve1")!) !==
      BigInt(get("invariantRawProduct")!)
    )
      throw Error("AMM invariant identity failed.");
    if (
      o.spotPriceRational.numeratorRaw !==
        (
          BigInt(get("reserve1")!) *
          10n ** BigInt(o.input.decimals0)
        ).toString() ||
      o.spotPriceRational.denominatorRaw !==
        (BigInt(get("reserve0")!) * 10n ** BigInt(o.input.decimals1)).toString()
    )
      throw Error("AMM exact price rational failed.");
    if (
      o.reversePriceRational.numeratorRaw !==
        o.spotPriceRational.denominatorRaw ||
      o.reversePriceRational.denominatorRaw !== o.spotPriceRational.numeratorRaw
    )
      throw Error("AMM inverse price rational failed.");
    if (
      o.mode === "swap" &&
      (!get("hypotheticalOutput") ||
        BigInt(get("postInvariantRawProduct")!) <
          BigInt(get("invariantRawProduct")!))
    )
      throw Error("AMM swap invariant failed.");
  },
  inputPorts(i) {
    return [
      port("amm-pool-math", "reserve0", manual(i.token0, i.decimals0)),
      port("amm-pool-math", "reserve1", manual(i.token1, i.decimals1)),
    ];
  },
  outputValues(i, o) {
    return outputValue(
      "amm-pool-math",
      o.fields,
      o.mode === "swap"
        ? "hypotheticalOutput"
        : o.mode === "liquidity"
          ? "usedToken0"
          : "reserve0",
      manual(
        o.mode === "swap" && i.direction === "one-to-zero"
          ? i.token0
          : o.mode === "swap"
            ? i.token1
            : i.token0,
        o.mode === "swap" && i.direction !== "one-to-zero"
          ? i.decimals1
          : i.decimals0,
      ),
    );
  },
};
export const concentratedLiquidityContract: PureToolContract<
  ClInput,
  ClResult
> = {
  id: "concentrated-liquidity",
  version: 1,
  title: localToolById("concentrated-liquidity").title,
  category: localToolById("concentrated-liquidity").category,
  capability: "local-pure",
  assumptions: [
    "Continuous bounded range model; manual token budgets and price.",
  ],
  limitations: ["No Uniswap tick, fee growth, NFT, wallet or real pool state."],
  validateInput(x) {
    if (!object(x))
      throw new ShapeError("Concentrated input must be an object.");
    if (x.mode === "composition" || x.mode === "scenario")
      return shape(x, prices, ["decimals0", "decimals1"]) as ClInput;
    if (x.mode === "fees")
      return shape(
        x,
        [
          ...prices,
          "accruedFee0",
          "accruedFee1",
          "managementCost1",
          "costCoverage",
        ],
        ["decimals0", "decimals1"],
      ) as ClInput;
    throw new ShapeError("Unsupported concentrated-liquidity mode.");
  },
  calculate: calculateConcentrated,
  validateOutput(o) {
    if (
      o.calculationVersion !== CL_VERSION ||
      !validFields(o.fields) ||
      !["complete", "incomplete"].includes(o.status) ||
      !Array.isArray(o.reasons)
    )
      throw Error("Concentrated output violates v1 shape.");
    const get = (n: string) => o.fields.find((f) => f.name === n)?.raw;
    if (
      !get("liquidityParameter") ||
      !get("initialToken0") ||
      !get("futureLpValue") ||
      !get("futureHodlValue") ||
      !get("lpMinusHodl")
    )
      throw Error("Concentrated values are missing.");
    if (
      BigInt(get("futureLpValue")!) - BigInt(get("futureHodlValue")!) !==
      BigInt(get("lpMinusHodl")!)
    )
      throw Error("LP/HODL identity failed.");
    if (o.status === "incomplete" && get("netLpMinusHodl"))
      throw Error("Unknown costs cannot yield a net assessment.");
  },
  inputPorts(i) {
    return [
      port("concentrated-liquidity", "budget0", manual(i.token0, i.decimals0)),
      port("concentrated-liquidity", "budget1", manual(i.token1, i.decimals1)),
    ];
  },
  outputValues(i, o) {
    return outputValue(
      "concentrated-liquidity",
      o.fields,
      "futureLpValue",
      manual(i.token1, i.decimals1),
    );
  },
};
export function runAmTool(
  id: "amm-pool-math",
  input: unknown,
): ToolRunResult<AmmResult>;
export function runAmTool(
  id: "concentrated-liquidity",
  input: unknown,
): ToolRunResult<ClResult>;
export function runAmTool(
  id: Id,
  input: unknown,
): ToolRunResult<AmmResult | ClResult>;
export function runAmTool(
  id: Id,
  input: unknown,
): ToolRunResult<AmmResult | ClResult> {
  try {
    if (id === "amm-pool-math") {
      const parsed = ammPoolContract.validateInput(input),
        output = ammPoolContract.calculate(parsed, {});
      ammPoolContract.validateOutput(output);
      return {
        status: "COMPLETE",
        output,
        inputPorts: ammPoolContract.inputPorts(parsed),
        values: ammPoolContract.outputValues(parsed, output),
      };
    }
    const parsed = concentratedLiquidityContract.validateInput(input),
      output = concentratedLiquidityContract.calculate(parsed, {});
    concentratedLiquidityContract.validateOutput(output);
    return {
      status: output.status === "complete" ? "COMPLETE" : "INCOMPLETE",
      output,
      inputPorts: concentratedLiquidityContract.inputPorts(parsed),
      values: concentratedLiquidityContract.outputValues(parsed, output),
    };
  } catch (e) {
    if (e instanceof ShapeError || e instanceof AiInputError)
      return {
        status: "ERROR",
        error: { code: "INVALID_INPUT", message: e.message },
      };
    return {
      status: "ERROR",
      error: {
        code: "INTERNAL_FAILURE",
        message: "The local calculation failed validation.",
      },
    };
  }
}
