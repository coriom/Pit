/** Closed Phase AN dispatch; each browser entry imports only its own contract. */
import { evmDataInspectorContract, runEvmTool } from "./an-evm-contract";
import {
  cryptoDataWorkshopContract,
  runWorkshopTool,
} from "./an-workshop-contract";
import type { EvmResult } from "./evm-data-inspector";
import type { WorkshopResult } from "./crypto-data-workshop";
import type { ToolRunResult } from "./pure-tool-contract";
export {
  evmDataInspectorContract,
  cryptoDataWorkshopContract,
  runEvmTool,
  runWorkshopTool,
};
export function runAnTool(
  id: "evm-data-inspector",
  input: unknown,
): ToolRunResult<EvmResult>;
export function runAnTool(
  id: "crypto-data-workshop",
  input: unknown,
): ToolRunResult<WorkshopResult>;
export function runAnTool(
  id: "evm-data-inspector" | "crypto-data-workshop",
  input: unknown,
): ToolRunResult<EvmResult | WorkshopResult>;
export function runAnTool(
  id: "evm-data-inspector" | "crypto-data-workshop",
  input: unknown,
): ToolRunResult<EvmResult | WorkshopResult> {
  return id === "evm-data-inspector"
    ? runEvmTool(input)
    : runWorkshopTool(input);
}
