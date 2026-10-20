/** Reviewed bounded CSV contract; browser FileReader remains outside. */
import {
  calculateWorkshop,
  WorkshopInputError,
  WORKSHOP_VERSION,
  type WorkshopInput,
  type WorkshopResult,
} from "./crypto-data-workshop";
import { localToolById } from "./local-tool-definitions";
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
const workshopValidate = (x: unknown): WorkshopInput => {
  if (
    !obj(x) ||
    !["inspect", "normalize", "dedupe"].includes(String(x.mode)) ||
    typeof x.text !== "string" ||
    ![",", ";", "\t"].includes(String(x.delimiter)) ||
    typeof x.hasHeader !== "boolean"
  )
    throw new ShapeError("Unsupported or incomplete CSV input.");
  if (
    x.mode === "inspect" &&
    exact(x, ["mode", "text", "delimiter", "hasHeader"])
  )
    return x as WorkshopInput;
  if (
    (x.mode === "normalize" || x.mode === "dedupe") &&
    exact(x, [
      "mode",
      "text",
      "delimiter",
      "hasHeader",
      "mapping",
      "amountDecimals",
      "dateFormat",
      "identityFields",
      "decisions",
    ]) &&
    x.hasHeader === true &&
    obj(x.mapping) &&
    Object.keys(x.mapping).length === 6 &&
    ["recordId", "chainId", "eventId", "timestampUtc", "amount", "note"].every(
      (k) => typeof (x.mapping as Record<string, unknown>)[k] === "string",
    ) &&
    Number.isSafeInteger(x.amountDecimals) &&
    ["iso-offset", "utc-date", "unix-seconds"].includes(String(x.dateFormat)) &&
    Array.isArray(x.identityFields) &&
    x.identityFields.length <= 4 &&
    x.identityFields.every((f) =>
      [
        "recordId",
        "chainId",
        "eventId",
        "timestampUtc",
        "amount",
        "note",
      ].includes(f),
    ) &&
    obj(x.decisions) &&
    Object.keys(x.decisions).length <= 1000 &&
    Object.entries(x.decisions).every(
      ([k, v]) =>
        /^(?:0|[1-9][0-9]{0,3})$/.test(k) && (v === "keep" || v === "exclude"),
    )
  )
    return x as WorkshopInput;
  throw new ShapeError(
    "CSV transformation requires explicit bounded mapping and decisions.",
  );
};

export const cryptoDataWorkshopContract: PureToolContract<
  WorkshopInput,
  WorkshopResult
> = {
  id: "crypto-data-workshop",
  version: 1,
  title: localToolById("crypto-data-workshop").title,
  category: localToolById("crypto-data-workshop").category,
  capability: "local-pure",
  assumptions: [
    "CSV text, header, delimiter, mapping and duplicate decisions are supplied explicitly.",
  ],
  limitations: [
    "No browser file capability, Taxlot interpretation, wallet access or automatic duplicate deletion.",
  ],
  validateInput: workshopValidate,
  calculate: calculateWorkshop,
  validateOutput(o) {
    if (
      o.calculationVersion !== WORKSHOP_VERSION ||
      !["inspect", "normalize", "dedupe"].includes(o.mode) ||
      !["COMPLETE", "INCOMPLETE"].includes(o.status) ||
      !Array.isArray(o.parsed.rows) ||
      o.parsed.rows.length > 1000 ||
      !Array.isArray(o.normalizedRows) ||
      o.normalizedRows.length > 1000 ||
      !Array.isArray(o.duplicates) ||
      !Array.isArray(o.reasons) ||
      !Array.isArray(o.includedRows) ||
      !Array.isArray(o.excludedRows) ||
      o.includedRows.some((n) => o.excludedRows.includes(n)) ||
      o.includedRows.length + o.excludedRows.length > o.parsed.rows.length ||
      (o.status === "COMPLETE" && o.reasons.length) ||
      (o.mode !== "inspect" && o.normalizedRows.length !== o.parsed.rows.length)
    )
      throw Error("Workshop output violates v1 shape.");
  },
  inputPorts() {
    return [port("crypto-data-workshop", "boundedCsvText")];
  },
  outputValues() {
    return [];
  },
};

export function runWorkshopTool(input: unknown): ToolRunResult<WorkshopResult> {
  try {
    const value = cryptoDataWorkshopContract.validateInput(input),
      output = cryptoDataWorkshopContract.calculate(value, {});
    cryptoDataWorkshopContract.validateOutput(output);
    return {
      status: output.status,
      output,
      inputPorts: cryptoDataWorkshopContract.inputPorts(value),
      values: [],
    };
  } catch (error) {
    if (error instanceof ShapeError || error instanceof WorkshopInputError)
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
