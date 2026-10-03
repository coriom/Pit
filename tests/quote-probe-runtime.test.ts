import { expect, it, vi } from "vitest";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import {
  createProbeFetch,
  probeExitCode,
} from "../scripts/audit/quote-probe-runtime.mjs";
import {
  diagnosticErrorCauses,
  probeDiagnosticMarket,
} from "../src/lib/diagnostic-quotes";
import { collectQuotes, type QuoteIntent } from "../src/lib/swap-quotes";
import { quoteMarkets } from "../src/lib/quote-markets";

const url = "https://ethereum-sepolia-rpc.publicnode.com";
const rpc = (body: unknown, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const client = (fetchImpl: typeof fetch) =>
  createPublicClient({
    chain: sepolia,
    transport: http(url, {
      fetchFn: createProbeFetch(url, { fetchImpl }),
      retryCount: 0,
      timeout: 8000,
    }),
  });

it("accepts a valid Sepolia chain ID and refuses a wrong-chain result", async () => {
  const good = vi.fn(async () =>
    rpc({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }),
  );
  expect(await client(good as typeof fetch).getChainId()).toBe(11155111);
  expect(good).toHaveBeenCalledOnce();
  const wrong = vi.fn(async () =>
    rpc({ jsonrpc: "2.0", id: 1, result: "0x1" }),
  );
  expect(await client(wrong as typeof fetch).getChainId()).not.toBe(11155111);
  expect(wrong).toHaveBeenCalledOnce();
  const cow = vi.fn();
  const uniswap = vi.fn();
  await expect(
    probeDiagnosticMarket(quoteMarkets[0], 0, {
      rpcFetch: createProbeFetch(url, { fetchImpl: wrong as typeof fetch }),
      cow: cow as never,
      uniswap: { id: "uniswap-v3", quote: uniswap } as never,
    }),
  ).rejects.toThrow("CONFIG_INVALID: RPC chain");
  expect(cow).not.toHaveBeenCalled();
  expect(uniswap).not.toHaveBeenCalled();
});

it("does not retry JSON-RPC errors, malformed replies, or an unapproved endpoint", async () => {
  const rejected = vi.fn(async () =>
    rpc({
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32602, message: "invalid params" },
    }),
  );
  await expect(client(rejected as typeof fetch).getChainId()).rejects.toThrow();
  expect(rejected).toHaveBeenCalledOnce();
  const malformed = vi.fn(
    async () => new Response("not-json", { status: 200 }),
  );
  await expect(
    client(malformed as typeof fetch).getChainId(),
  ).rejects.toThrow();
  expect(malformed).toHaveBeenCalledOnce();
  await expect(
    createProbeFetch(url, { fetchImpl: rejected as typeof fetch })(
      "https://other.example/rpc",
    ),
  ).rejects.toThrow("CONFIG_INVALID");
});

it("bounds a transient retry and preserves a rate-limit Retry-After beyond the budget", async () => {
  const transient = vi
    .fn()
    .mockRejectedValueOnce(
      Object.assign(new Error("synthetic timeout"), { name: "TimeoutError" }),
    )
    .mockResolvedValueOnce(rpc({ jsonrpc: "2.0", id: 1, result: "0xaa36a7" }));
  expect(await client(transient as typeof fetch).getChainId()).toBe(11155111);
  expect(transient).toHaveBeenCalledTimes(2);
  const alwaysTimeout = vi.fn(async () => {
    throw Object.assign(new Error("synthetic timeout"), {
      name: "TimeoutError",
    });
  });
  await expect(
    client(alwaysTimeout as typeof fetch).getChainId(),
  ).rejects.toThrow();
  expect(alwaysTimeout).toHaveBeenCalledTimes(2);
  const limited = vi.fn(async () =>
    rpc({ error: "rate limited" }, 429, { "Retry-After": "60" }),
  );
  await expect(client(limited as typeof fetch).getChainId()).rejects.toThrow();
  expect(limited).toHaveBeenCalledOnce();
  const aborted = vi.fn(async () => {
    throw new DOMException("synthetic abort", "AbortError");
  });
  await expect(client(aborted as typeof fetch).getChainId()).rejects.toThrow();
  expect(aborted).toHaveBeenCalledOnce();
});

it("reports nested error types without values and exits nonzero for incomplete comparisons", async () => {
  const cause = Object.assign(new Error("synthetic_credential_value"), {
    code: "ECONNRESET",
  });
  const outer = new Error("synthetic wrapper", { cause });
  expect(diagnosticErrorCauses(outer)).toEqual([
    { name: "Error", code: null },
    { name: "Error", code: "ECONNRESET" },
  ]);
  expect(JSON.stringify(diagnosticErrorCauses(outer))).not.toContain(
    "credential",
  );
  expect(probeExitCode([{ status: "BLOCKED" }])).toBe(2);
  expect(probeExitCode([{ status: "CONFIG_OR_READ_FAILURE" }])).toBe(3);
  expect(probeExitCode([{ status: "COMPARISON_OK" }])).toBe(0);

  const market = quoteMarkets[0];
  const intent: QuoteIntent = {
    chainId: 11155111,
    sellToken: market.sell.address,
    buyToken: market.buy.address,
    sellAmountText: "0.01",
    direction: "exact-in",
  };
  const outcomes = await collectQuotes(
    [
      {
        id: "cow",
        quote: async () => {
          throw Error("temporary provider failure");
        },
      },
      {
        id: "uniswap-v3",
        quote: async () => ({
          provider: "uniswap-v3" as const,
          availability: "available" as const,
          chainId: 11155111,
          sellToken: market.sell.address,
          buyToken: market.buy.address,
          direction: "exact-in" as const,
          sellDecimals: 18,
          buyDecimals: 6,
          sellAmount: 10000000000000000n,
          swapInputSellAmount: 10000000000000000n,
          buyAmount: 1n,
          minimumReceiveBuyAmount: null,
          protocolFee: {
            amount: null,
            token: "sell" as const,
            ratePpm: 500,
            includedInBuyAmount: true as const,
          },
          networkCostSellAmount: null,
          estimatedGasUnits: 123373n,
          gasEstimateScope: "quoter-internal-only" as const,
          singlePoolAddress: "0x3289680dD4d6C10bb19b899729cda5eEF58AEfF1",
          pitFeeBuyAmount: 0n,
          quotedAtMs: Date.now(),
          expiresAtMs: Date.now() + 30_000,
          executableThroughPit: false,
        }),
      },
    ],
    intent,
  );
  expect(outcomes).toHaveLength(2);
  expect(outcomes.map((value) => value.provider)).toEqual([
    "cow",
    "uniswap-v3",
  ]);
  expect(outcomes.map((value) => value.availability)).toEqual([
    "unavailable",
    "available",
  ]);
});
