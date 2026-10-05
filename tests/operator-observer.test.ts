import { expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { approveSwap, submitSwap } from "../src/lib/cow";
import {
  OBSERVER_INTENT,
  observeCowOperator,
  safeObserverError,
  type OperatorObserverOps,
} from "../src/lib/operator-observer";
import { quoteMarkets } from "../src/lib/quote-markets";

const owner = "0xA94E0b829ABcaB65225c7C18ccA5937011a4a6a7";
const market = quoteMarkets[0];
const now = Date.parse("2026-10-05T04:00:00.000Z");
const baseQuote = () => ({
  id: 12345,
  verified: true,
  from: owner,
  sellToken: OBSERVER_INTENT.sellToken,
  buyToken: OBSERVER_INTENT.buyToken,
  sellAmount: "980000",
  feeAmount: "20000",
  expiration: new Date(now + 120000).toISOString(),
  protocolFeeBps: "2",
  quote: {
    sellToken: OBSERVER_INTENT.sellToken,
    buyToken: OBSERVER_INTENT.buyToken,
    receiver: null,
    sellAmount: "980000",
    buyAmount: "400000000000000",
    validTo: Math.floor((now + 120000) / 1000),
    appData: `0x${"0".repeat(64)}`,
    feeAmount: "20000",
    gasAmount: "200000",
    gasPrice: "1000000000",
    sellTokenPrice: "1",
    kind: "sell" as const,
    partiallyFillable: false,
    sellTokenBalance: "erc20" as const,
    buyTokenBalance: "erc20" as const,
    signingScheme: "eip712" as const,
  },
});
function fakeOps(overrides: Partial<OperatorObserverOps> = {}) {
  const ops: OperatorObserverOps = {
    chainId: vi.fn(async () => 11155111),
    block: vi.fn(async () => ({
      number: 11846234n,
      hash: `0x${"a".repeat(64)}`,
    })),
    codeHash: vi.fn(async (address) => {
      if (address.toLowerCase() === market.sell.address.toLowerCase())
        return market.sell.codeKeccak256;
      if (address.toLowerCase() === market.buy.address.toLowerCase())
        return market.buy.codeKeccak256;
      return `hex:${"a".repeat(64)}`;
    }),
    decimals: vi.fn(async (address) =>
      address.toLowerCase() === market.buy.address.toLowerCase() ? 6 : 18,
    ),
    ethBalance: vi.fn(async () => 50000000000000000n),
    tokenBalance: vi.fn(async (token) =>
      token.toLowerCase() === OBSERVER_INTENT.sellToken.toLowerCase()
        ? 20000000n
        : 0n,
    ),
    allowance: vi.fn(async () => 0n),
    approvalGas: vi.fn(async () => 56240n),
    gasPrice: vi.fn(async () => 1000000000n),
    cowQuote: vi.fn(async () => baseQuote() as never),
    ...overrides,
  };
  return ops;
}
const status = (
  result: Awaited<ReturnType<typeof observeCowOperator>>,
  id: string,
) => result.readiness.find((item) => item.id === id)?.status;

it("observes funded public address and returns a non-executable SDK-normalized quote", async () => {
  const ops = fakeOps();
  const walletRequest = vi.fn();
  vi.stubGlobal("ethereum", { request: walletRequest });
  const result = await observeCowOperator(owner, ops, () => now);
  expect(result.observerReady).toBe(true);
  expect(result.walletExecutionReady).toBe(false);
  expect(result.approvalRequired).toBe(true);
  expect(result.approvalGasUnits).toBe("56240");
  expect(result.intent.sellAmount).toBe("1000000");
  expect(result.quote).toMatchObject({
    id: 12345,
    diagnosticOnly: true,
    executableThroughPit: false,
    sellAmount: "1000000",
    swapInputSellAmount: "980000",
    pitFeeBuyAmount: "0",
  });
  expect(result.handoff).toMatchObject({
    action: "ERC20_APPROVAL",
    wallet: owner,
    network: "Ethereum Sepolia 11155111",
    token: OBSERVER_INTENT.sellToken,
    spender: OBSERVER_INTENT.approvalTarget,
    requiredAllowance: "1000000",
    currentAllowance: "0",
    estimatedApprovalGasUnits: "56240",
    executableQuoteRequired: true,
    submitted: false,
  });
  expect(status(result, "wallet")).toBe("UNKNOWN");
  expect(status(result, "storage")).toBe("UNKNOWN");
  expect(status(result, "quote")).toBe("PASS");
  expect(ops.cowQuote).toHaveBeenCalledWith(owner, "1000000");
  expect(walletRequest).not.toHaveBeenCalled();
  await expect(approveSwap(result.quote as never)).rejects.toThrow(
    "INVALID_EXECUTION_QUOTE",
  );
  await expect(submitSwap(result.quote as never)).rejects.toThrow(
    "INVALID_EXECUTION_QUOTE",
  );
  expect(walletRequest).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("fails closed on zero balance, wrong chain, RPC failure and wrong token metadata", async () => {
  const zero = await observeCowOperator(
    owner,
    fakeOps({ tokenBalance: vi.fn(async () => 0n) }),
    () => now,
  );
  expect(status(zero, "funds")).toBe("FAIL");
  expect(zero.quote).toBeNull();
  expect(zero.handoff).toBeNull();
  const wrong = await observeCowOperator(
    owner,
    fakeOps({ chainId: vi.fn(async () => 84532) }),
    () => now,
  );
  expect(status(wrong, "chain")).toBe("FAIL");
  expect(wrong.quote).toBeNull();
  const unavailable = await observeCowOperator(
    owner,
    fakeOps({
      chainId: vi.fn(async () => {
        throw new Error("RPC unavailable");
      }),
    }),
    () => now,
  );
  expect(status(unavailable, "chain")).toBe("UNKNOWN");
  expect(unavailable.observerReady).toBe(false);
  const metadata = await observeCowOperator(
    owner,
    fakeOps({ decimals: vi.fn(async () => 18) }),
    () => now,
  );
  expect(status(metadata, "assets")).toBe("FAIL");
  expect(metadata.quote).toBeNull();
});

it("handles zero or nonzero allowance and quote failures without requesting a wallet action", async () => {
  const enough = await observeCowOperator(
    owner,
    fakeOps({
      allowance: vi.fn(async () => 1000000n),
      approvalGas: vi.fn(async () => {
        throw new Error("must not estimate");
      }),
    }),
    () => now,
  );
  expect(enough.approvalRequired).toBe(false);
  expect(enough.approvalGasUnits).toBeNull();
  expect(enough.handoff?.action).toBe("COW_ORDER_REVIEW");
  const noQuote = await observeCowOperator(
    owner,
    fakeOps({
      cowQuote: vi.fn(async () => {
        throw new Error("CoW unsupported token");
      }),
    }),
    () => now,
  );
  expect(noQuote.observerReady).toBe(false);
  expect(status(noQuote, "quote")).toBe("UNKNOWN");
  expect(noQuote.quoteError).toContain("unsupported token");
  const stale = await observeCowOperator(
    owner,
    fakeOps({
      cowQuote: vi.fn(
        async () =>
          ({
            ...baseQuote(),
            expiration: new Date(now - 1).toISOString(),
          }) as never,
      ),
    }),
    () => now,
  );
  expect(stale.quote).toBeNull();
  expect(status(stale, "quote")).toBe("FAIL");
  const noRoute = await observeCowOperator(
    owner,
    fakeOps({
      cowQuote: vi.fn(async () => {
        throw {
          response: { status: 404 },
          body: { errorType: "NoLiquidity", description: "no route found" },
        };
      }),
    }),
    () => now,
  );
  expect(noRoute.quoteError).toBe("HTTP 404 NoLiquidity: no route found");
  expect(status(noRoute, "quote")).toBe("FAIL");
  expect(noRoute.handoff).toBeNull();
  expect(
    safeObserverError({
      response: { status: 401 },
      body: {
        errorType: "NoLiquidity",
        description: "secret=https://example.invalid/key",
      },
    }),
  ).not.toContain("example.invalid");
});

it("observer source has no wallet or state-changing capability", () => {
  const source = [
    "src/lib/operator-observer.ts",
    "src/lib/operator-verification.ts",
    "scripts/audit/operator-observe.mjs",
    "scripts/audit/operator-verify.mjs",
  ]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  for (const forbidden of [
    "eth_requestAccounts",
    "personal_sign",
    "eth_sign",
    "eth_sendTransaction",
    "approveSwap(",
    "submitSwap(",
    "postSwapOrderFromQuote",
    "walletClient",
    "writeContract",
  ])
    expect(source).not.toContain(forbidden);
});
