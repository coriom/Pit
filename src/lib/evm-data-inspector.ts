/** Offline EVM data inspection. This module imports only viem's pure utilities. */
import {
  decodeFunctionData,
  getAddress,
  keccak256,
  stringToHex,
  toFunctionSelector,
} from "viem/utils";

export const EVM_INSPECTOR_VERSION = "pit.evm-data-inspector.local.v1";
export const MAX_ABI_BYTES = 8192;
export const MAX_CALLDATA_BYTES = 4096;
const addressShape = /^0x[0-9a-fA-F]{40}$/;
const identifier = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const staticType =
  /^(?:address|bool|u?int(?:8|16|24|32|40|48|56|64|72|80|88|96|104|112|120|128|136|144|152|160|168|176|184|192|200|208|216|224|232|240|248|256)|bytes(?:[1-9]|[12][0-9]|3[0-2]))$/;
export class EvmInputError extends Error {
  readonly name = "EvmInputError";
}
const reject = (message: string): never => {
  throw new EvmInputError(message);
};

export type EvmInput =
  | { mode: "address"; address: string; chainId: string }
  | { mode: "signature"; kind: "function" | "event"; signature: string }
  | { mode: "decode"; abiJson: string; calldata: string };
export type EvmResult = {
  calculationVersion: typeof EVM_INSPECTOR_VERSION;
  mode: EvmInput["mode"];
  primary: string;
  details: { name: string; value: string }[];
  limitations: string[];
};

export function inspectAddress(address: string, chainId: string) {
  if (!addressShape.test(address))
    reject("Address must be 0x plus exactly 40 hexadecimal characters.");
  if (
    chainId &&
    (!/^[1-9][0-9]{0,9}$/.test(chainId) || BigInt(chainId) > 4_294_967_295n)
  )
    reject("Chain ID must be a positive bounded decimal integer, or blank.");
  const checksummed = getAddress(address.toLowerCase());
  const body = address.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  return {
    checksummed,
    lowercase: address.toLowerCase(),
    checksumStatus: mixed
      ? address === checksummed
        ? "VALID_EIP55"
        : "INVALID_EIP55"
      : "NOT_CARRIED",
    chainDescriptor: chainId
      ? `eip155:${chainId}:${checksummed}`
      : "No chain identity supplied",
  } as const;
}

function canonicalSignature(signature: string) {
  if (signature.length > 512 || /\s/.test(signature))
    reject(
      "Use a bounded canonical signature without spaces, names or aliases.",
    );
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)$/.exec(signature);
  if (!match || !identifier.test(match[1]))
    throw new EvmInputError("Invalid canonical function or event signature.");
  const types = match[2] ? match[2].split(",") : [];
  if (types.length > 8 || types.some((type) => !staticType.test(type)))
    reject("Only up to eight canonical static primitive types are supported.");
  return signature;
}
export function inspectSignature(
  kind: "function" | "event",
  signature: string,
) {
  const canonical = canonicalSignature(signature);
  const digest = keccak256(stringToHex(canonical));
  return {
    canonical,
    selectorOrTopic: kind === "function" ? `0x${digest.slice(2, 10)}` : digest,
    kind,
  };
}

type AbiParameter = { name: string; type: string };
type AbiFunction = { type: "function"; name: string; inputs: AbiParameter[] };
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === "object" && !Array.isArray(x);
const keysOnly = (x: Record<string, unknown>, keys: string[]) =>
  Object.keys(x).every((k) => keys.includes(k));

/** Supported ABI JSON is an array of at most 8 static function fragments. */
export function parseStaticAbi(json: string): AbiFunction[] {
  if (new TextEncoder().encode(json).length > MAX_ABI_BYTES)
    reject("ABI JSON exceeds 8 KiB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    reject("ABI JSON is malformed.");
  }
  const fragments = Array.isArray(parsed) ? parsed : [parsed];
  if (!fragments.length || fragments.length > 8)
    reject("Provide one to eight function fragments.");
  const seen = new Set<string>();
  return fragments.map((item) => {
    if (
      !object(item) ||
      !keysOnly(item, ["type", "name", "inputs"]) ||
      item.type !== "function" ||
      typeof item.name !== "string" ||
      !identifier.test(item.name) ||
      !Array.isArray(item.inputs) ||
      item.inputs.length > 8
    )
      reject(
        "ABI must contain bounded function fragments with static inputs only.",
      );
    const inputs = item.inputs.map((param: unknown) => {
      if (
        !object(param) ||
        !keysOnly(param, ["name", "type"]) ||
        typeof param.name !== "string" ||
        (param.name !== "" && !identifier.test(param.name)) ||
        typeof param.type !== "string" ||
        !staticType.test(param.type)
      )
        throw new EvmInputError(
          "Unsupported ABI parameter. Tuples, arrays and dynamic types are excluded.",
        );
      return { name: param.name, type: param.type };
    });
    const signature = `${item.name}(${inputs.map((p: AbiParameter) => p.type).join(",")})`;
    const selector = inspectSignature("function", signature).selectorOrTopic;
    if (seen.has(selector)) reject("Ambiguous or duplicate ABI selector.");
    seen.add(selector);
    return { type: "function" as const, name: item.name, inputs };
  });
}

export function decodeStaticCall(abiJson: string, calldata: string) {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(calldata))
    reject("Calldata must be even-length hexadecimal bytes.");
  if ((calldata.length - 2) / 2 > MAX_CALLDATA_BYTES)
    reject("Calldata exceeds 4 KiB.");
  if (calldata.length < 10)
    reject("Calldata is shorter than a four-byte selector.");
  const functions = parseStaticAbi(abiJson);
  const selector = calldata.slice(0, 10).toLowerCase();
  const matches = functions.filter(
    (item) => toFunctionSelector(item as never).toLowerCase() === selector,
  );
  if (matches.length !== 1)
    reject(
      matches.length
        ? "Ambiguous selector."
        : "No ABI function matches this selector.",
    );
  const fragment = matches[0];
  const expected = 10 + fragment.inputs.length * 64;
  if (calldata.length !== expected)
    reject(
      calldata.length < expected
        ? "Calldata is truncated."
        : "Unexpected trailing calldata bytes.",
    );
  let args: readonly unknown[] = [];
  try {
    args =
      decodeFunctionData({
        abi: [fragment] as never,
        data: calldata as `0x${string}`,
      }).args ?? [];
  } catch {
    throw new EvmInputError(
      "Calldata does not conform to the supplied static ABI.",
    );
  }
  return {
    name: fragment.name,
    signature: `${fragment.name}(${fragment.inputs.map((p) => p.type).join(",")})`,
    selector,
    parameters: fragment.inputs.map((param, index) => ({
      name: param.name || `arg${index}`,
      type: param.type,
      value:
        typeof args[index] === "bigint"
          ? args[index].toString()
          : String(args[index]),
    })),
  };
}

export function calculateEvm(input: EvmInput): EvmResult {
  if (input.mode === "address") {
    const data = inspectAddress(input.address, input.chainId);
    return {
      calculationVersion: EVM_INSPECTOR_VERSION,
      mode: input.mode,
      primary: data.checksummed,
      details: [
        { name: "EIP-55 checksum carried", value: data.checksumStatus },
        { name: "Lowercase", value: data.lowercase },
        { name: "Optional chain descriptor", value: data.chainDescriptor },
      ],
      limitations: [
        "Syntax and checksum do not prove account existence, ownership or recipient correctness.",
      ],
    };
  }
  if (input.mode === "signature") {
    const data = inspectSignature(input.kind, input.signature);
    return {
      calculationVersion: EVM_INSPECTOR_VERSION,
      mode: input.mode,
      primary: data.selectorOrTopic,
      details: [
        { name: "Canonical signature", value: data.canonical },
        {
          name: "Hash type",
          value:
            data.kind === "function"
              ? "Four-byte function selector"
              : "Non-anonymous event topic0",
        },
      ],
      limitations: [
        "Ethereum Keccak-256; no remote signature lookup or contract verification.",
      ],
    };
  }
  const data = decodeStaticCall(input.abiJson, input.calldata);
  return {
    calculationVersion: EVM_INSPECTOR_VERSION,
    mode: input.mode,
    primary: `${data.name} · ${data.selector}`,
    details: [
      { name: "Signature", value: data.signature },
      ...data.parameters.map((p) => ({
        name: `${p.name} (${p.type})`,
        value: p.value,
      })),
    ],
    limitations: [
      "Data decoding cannot establish contract safety or transaction success.",
    ],
  };
}
export const evmReportJSON = (input: EvmInput, output: EvmResult) =>
  JSON.stringify(
    {
      input,
      output,
      disclaimer:
        "Offline data inspection only; no wallet, RPC or contract execution.",
    },
    null,
    2,
  );
