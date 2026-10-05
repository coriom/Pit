import { expect, it, vi } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import {
  verifyPublicApproval,
  verifyPublicOrder,
  type PublicVerificationOps,
} from "../src/lib/operator-verification";
import { OBSERVER_INTENT } from "../src/lib/operator-observer";

const account = "0xA94E0b829ABcaB65225c7C18ccA5937011a4a6a7";
const hash = `0x${"a".repeat(64)}`;
const uid = `0x${"b".repeat(112)}`;
const approvalData = (
  spender: string = OBSERVER_INTENT.approvalTarget,
  amount = 1000000n,
) =>
  encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [spender as `0x${string}`, amount],
  });
function ops(
  overrides: Partial<PublicVerificationOps> = {},
): PublicVerificationOps {
  return {
    chainId: vi.fn(async () => 11155111),
    transaction: vi.fn(async () => ({
      from: account as `0x${string}`,
      to: OBSERVER_INTENT.sellToken,
      input: approvalData(),
      value: 0n,
    })),
    receipt: vi.fn(async () => ({
      status: "success" as const,
      blockNumber: 11846234n,
    })),
    allowance: vi.fn(async () => 1000000n),
    order: vi.fn(async () => ({
      owner: account,
      sellToken: OBSERVER_INTENT.sellToken,
      buyToken: OBSERVER_INTENT.buyToken,
      status: "fulfilled",
      executedSellAmount: "1000000",
      executedBuyAmount: "400000000000000",
    })),
    trades: vi.fn(async () => [
      {
        orderUid: uid,
        owner: account,
        txHash: hash,
        sellAmount: "1000000",
        sellAmountBeforeFees: "980000",
        buyAmount: "400000000000000",
        blockNumber: 11846234,
        logIndex: 1,
      },
    ]),
    ...overrides,
  };
}

it("verifies a public approval receipt, exact spender and refreshed allowance without wallet calls", async () => {
  const wallet = vi.fn();
  vi.stubGlobal("ethereum", { request: wallet });
  const result = await verifyPublicApproval(account, hash, ops());
  expect(result).toMatchObject({
    verified: true,
    currentAllowance: "1000000",
    approvedAmount: "1000000",
    spender: OBSERVER_INTENT.approvalTarget,
  });
  expect(wallet).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("rejects wrong chain, wrong spender, reverted receipt and insufficient refreshed allowance", async () => {
  await expect(
    verifyPublicApproval(
      account,
      hash,
      ops({ chainId: vi.fn(async () => 84532) }),
    ),
  ).rejects.toThrow("Wrong RPC chain");
  await expect(
    verifyPublicApproval(
      account,
      hash,
      ops({
        transaction: vi.fn(async () => ({
          from: account as `0x${string}`,
          to: OBSERVER_INTENT.sellToken,
          input: approvalData("0x1111111111111111111111111111111111111111"),
          value: 0n,
        })),
      }),
    ),
  ).rejects.toThrow("spender or amount");
  await expect(
    verifyPublicApproval(
      account,
      hash,
      ops({
        receipt: vi.fn(async () => ({
          status: "reverted" as const,
          blockNumber: 1n,
        })),
      }),
    ),
  ).rejects.toThrow("receipt mismatch");
  const insufficient = await verifyPublicApproval(
    account,
    hash,
    ops({ allowance: vi.fn(async () => 0n) }),
  );
  expect(insufficient.verified).toBe(false);
});

it("verifies public order identity and exact integer fill totals, without manufacturing accounting", async () => {
  const result = await verifyPublicOrder(account, uid, ops());
  expect(result.terminal).toBe(true);
  expect(result.fillTotals).toEqual({
    sellAmount: "1000000",
    sellAmountBeforeFees: "980000",
    buyAmount: "400000000000000",
  });
  expect(result.nextAction).toContain("IndexedDB");
  expect(result).not.toHaveProperty("taxlotEvent");
  await expect(
    verifyPublicOrder(
      account,
      uid,
      ops({
        order: vi.fn(async () => ({
          owner: "0x1111111111111111111111111111111111111111",
          sellToken: OBSERVER_INTENT.sellToken,
          buyToken: OBSERVER_INTENT.buyToken,
          status: "fulfilled",
          executedSellAmount: "1",
          executedBuyAmount: "1",
        })),
      }),
    ),
  ).rejects.toThrow("Order account");
  const pending = await verifyPublicOrder(
    account,
    uid,
    ops({
      order: vi.fn(async () => ({
        owner: account,
        sellToken: OBSERVER_INTENT.sellToken,
        buyToken: OBSERVER_INTENT.buyToken,
        status: "open",
        executedSellAmount: "0",
        executedBuyAmount: "0",
      })),
      trades: vi.fn(async () => []),
    }),
  );
  expect(pending.terminal).toBe(false);
});
