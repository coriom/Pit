/** Reviewed offline EVM contract; no browser or provider capability. */
import {
  calculateEvm,
  EvmInputError,
  EVM_INSPECTOR_VERSION,
  type EvmInput,
  type EvmResult,
} from "./evm-data-inspector";
import { toolById } from "./tool-registry";
import type {
  PureToolContract,
  ToolRunResult,
  ToolPort,
} from "./pure-tool-contract";

class ShapeError extends Error {
  readonly name = "ShapeError";
}
const obj = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const exact = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).length === keys.length &&
  keys.every((k) => Object.hasOwn(x, k));
const port = (
  id: "evm-data-inspector" | "crypto-data-workshop",
  name: string,
): ToolPort => ({
  name,
  valueType: "collection",
  unit: null,
  required: true,
  sourceToolId: id,
  sourceContractVersion: 1,
});
const evmValidate = (x: unknown): EvmInput => {
  if (!obj(x)) throw new ShapeError("Input must be an object.");
  if (
    x.mode === "address" &&
    exact(x, ["mode", "address", "chainId"]) &&
    typeof x.address === "string" &&
    typeof x.chainId === "string"
  )
    return x as EvmInput;
  if (
    x.mode === "signature" &&
    exact(x, ["mode", "kind", "signature"]) &&
    (x.kind === "function" || x.kind === "event") &&
    typeof x.signature === "string"
  )
    return x as EvmInput;
  if (
    x.mode === "decode" &&
    exact(x, ["mode", "abiJson", "calldata"]) &&
    typeof x.abiJson === "string" &&
    typeof x.calldata === "string"
  )
    return x as EvmInput;
  throw new ShapeError("Unsupported or incomplete EVM inspector input.");
};
export const evmDataInspectorContract: PureToolContract<EvmInput, EvmResult> = {
  id: "evm-data-inspector",
  version: 1,
  title: toolById("evm-data-inspector").title,
  category: toolById("evm-data-inspector").category,
  capability: "local-pure",
  assumptions: ["All input is manually supplied; EIP-55 is chain-independent."],
  limitations: [
    "No address existence check, remote signature lookup or transaction execution.",
    "ABI decoder supports at most eight static primitive parameters.",
  ],
  validateInput: evmValidate,
  calculate: calculateEvm,
  validateOutput(o) {
    if (
      o.calculationVersion !== EVM_INSPECTOR_VERSION ||
      !["address", "signature", "decode"].includes(o.mode) ||
      typeof o.primary !== "string" ||
      !o.primary ||
      !Array.isArray(o.details) ||
      o.details.length > 10 ||
      o.details.some(
        (d) => typeof d.name !== "string" || typeof d.value !== "string",
      ) ||
      !Array.isArray(o.limitations) ||
      !o.limitations.length ||
      (o.mode === "address" && !/^0x[0-9a-fA-F]{40}$/.test(o.primary)) ||
      (o.mode === "signature" &&
        !/^0x(?:[0-9a-f]{8}|[0-9a-f]{64})$/.test(o.primary))
    )
      throw Error("EVM output violates v1 shape.");
  },
  inputPorts() {
    return [port("evm-data-inspector", "manualInput")];
  },
  outputValues() {
    return [];
  },
};
export function runEvmTool(input: unknown): ToolRunResult<EvmResult> {
  try {
    const value = evmDataInspectorContract.validateInput(input),
      output = evmDataInspectorContract.calculate(value, {});
    evmDataInspectorContract.validateOutput(output);
    return {
      status: "COMPLETE",
      output,
      inputPorts: evmDataInspectorContract.inputPorts(value),
      values: [],
    };
  } catch (error) {
    if (error instanceof ShapeError || error instanceof EvmInputError)
      return {
        status: "ERROR",
        error: { code: "INVALID_INPUT", message: error.message },
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
