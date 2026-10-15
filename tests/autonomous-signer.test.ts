import { describe, expect, it, vi } from "vitest";
import { encodeFunctionData, erc20Abi, parseAbi } from "viem";
import {
  TEST_OPERATOR,
  assertReviewedTransaction,
  assertTestRelease,
  createTestProvider,
} from "../scripts/audit/autonomous-signer.mjs";

const from = TEST_OPERATOR.address;
const deposit = {
  from,
  to: TEST_OPERATOR.weth,
  chainId: TEST_OPERATOR.chainId,
  value: TEST_OPERATOR.sellBudget,
  data: "0xd0e30db0",
};
const approval = {
  from,
  to: TEST_OPERATOR.weth,
  chainId: TEST_OPERATOR.chainId,
  value: 0n,
  data: encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [TEST_OPERATOR.relayer, TEST_OPERATOR.sellBudget],
  }),
};
describe("test-only autonomous signer gates", () => {
  it("permits only the exact reviewed deposit and exact approval", () => {
    expect(assertReviewedTransaction(deposit)).toBe("deposit");
    expect(assertReviewedTransaction(approval)).toBe("approve");
  });
  it("rejects fee or mainnet enablement", () => {
    expect(() => assertTestRelease("FEES_ENABLED: true as boolean,\nMAINNET_ENABLED: false as boolean,")).toThrow();
    expect(() => assertTestRelease("FEES_ENABLED: false as boolean,\nMAINNET_ENABLED: true as boolean,")).toThrow();
    expect(() => assertTestRelease("FEES_ENABLED: false as boolean,\nFEES_ENABLED: true as boolean,\nMAINNET_ENABLED: false as boolean,")).toThrow();
  });
  it.each([
    ["wrong chain", { ...deposit, chainId: 1 }],
    ["wrong sender", { ...deposit, from: TEST_OPERATOR.relayer }],
    ["arbitrary destination", { ...deposit, to: TEST_OPERATOR.usdc }],
    ["arbitrary calldata", { ...deposit, data: "0x12345678" }],
    ["oversized value", { ...deposit, value: TEST_OPERATOR.maxEthValue + 1n }],
    ["wrong deposit amount", { ...deposit, value: 1n }],
    ["unlimited approval", { ...approval, data: encodeFunctionData({
      abi: erc20Abi, functionName: "approve",
      args: [TEST_OPERATOR.relayer, (1n << 256n) - 1n],
    }) }],
    ["wrong spender", { ...approval, data: encodeFunctionData({
      abi: erc20Abi, functionName: "approve",
      args: [TEST_OPERATOR.usdc, TEST_OPERATOR.sellBudget],
    }) }],
  ])("rejects %s", (_name, tx) => {
    expect(() => assertReviewedTransaction(tx)).toThrow();
  });
  it("blocks unknown methods, wrong RPC chain, and a second send after ambiguous failure", async () => {
    let chain = "0xaa36a7";
    const calls = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_chainId") return chain;
      throw Error("synthetic transport failure");
    });
    const transport = () => ({ request: calls });
    const account = { address: from, signTypedData: vi.fn() };
    const provider = createTestProvider({ account: account as never, transport: transport as never, allowTransactions: true });
    await expect(provider.request({ method: "personal_sign" })).rejects.toThrow("AUTONOMOUS_METHOD_DENIED");
    await expect(provider.request({ method: "eth_sendTransaction", params: [deposit] as never })).rejects.toThrow();
    expect(provider.sent).toBe(true);
    await expect(provider.request({ method: "eth_sendTransaction", params: [deposit] as never })).rejects.toThrow("AUTONOMOUS_NO_TRANSACTION_RETRY");
    chain = "0x1";
    await expect(provider.request({ method: "eth_accounts" })).rejects.toThrow("AUTONOMOUS_WRONG_CHAIN");
    expect(account.signTypedData).not.toHaveBeenCalled();
  });
  it("arms only one exact Sepolia Uniswap approval or reviewed 500-tier swap", async () => {
    const transport = () => ({ request: vi.fn(async () => "0xaa36a7") });
    const account = { address: from, signTypedData: vi.fn() };
    const approvalProvider = createTestProvider({ account: account as never,
      transport: transport as never, allowTransactions: true });
    approvalProvider.armReviewedUniswap({ action: "approve" });
    const uniApproval = { from, to: TEST_OPERATOR.usdc, chainId: 11155111, value: 0n,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve",
        args: [TEST_OPERATOR.uniswapRouter, TEST_OPERATOR.uniswapSellCap] }) };
    expect(assertReviewedTransaction(uniApproval, { action: "approve" })).toBe("uniswap-approve");
    expect(() => assertReviewedTransaction(uniApproval)).toThrow();
    expect(() => assertReviewedTransaction({ ...uniApproval, chainId: 1 }, { action: "approve" })).toThrow();
    expect(() => assertReviewedTransaction({ ...uniApproval, data: encodeFunctionData({
      abi: erc20Abi, functionName: "approve",
      args: [TEST_OPERATOR.uniswapRouter, (1n << 256n) - 1n],
    }) }, { action: "approve" })).toThrow();
    const swapProvider = createTestProvider({ account: account as never,
      transport: transport as never, allowTransactions: true });
    const expiresAt = Date.now() + 20000;
    swapProvider.armReviewedUniswap({ action: "swap", minimumBuy: 1000n,
      expectedBuy: 1100n, expiresAt });
    const abi = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)"]);
    const swap = { from, to: TEST_OPERATOR.uniswapRouter, chainId: 11155111, value: 0n,
      data: encodeFunctionData({ abi, functionName: "exactInputSingle", args: [{
        tokenIn: TEST_OPERATOR.usdc, tokenOut: TEST_OPERATOR.weth, fee: 500,
        recipient: from, amountIn: TEST_OPERATOR.uniswapSellCap,
        amountOutMinimum: 1000n, sqrtPriceLimitX96: 0n,
      }] }) };
    const spec = { action: "swap", minimumBuy: 1000n, expiresAt,
      data: swap.data.toLowerCase() };
    expect(assertReviewedTransaction(swap, spec)).toBe("uniswap-swap");
    expect(() => assertReviewedTransaction(swap)).toThrow();
    expect(() => assertReviewedTransaction({ ...swap, data: "0x12345678" }, spec)).toThrow();
    expect(() => assertReviewedTransaction({ ...swap, value: 1n }, spec)).toThrow();
    expect(() => assertReviewedTransaction(swap, { ...spec, expiresAt: 0 })).toThrow();
    expect(() => swapProvider.armReviewedUniswap({ action: "swap", minimumBuy: 1n,
      expectedBuy: 2n, expiresAt })).toThrow("AUTONOMOUS_UNISWAP_ARMING");
  });
  it("requires an armed, exact CoW typed order and permits only one signature", async () => {
    const transport = () => ({ request: vi.fn(async () => "0xaa36a7") });
    const account = { address: from, signTypedData: vi.fn(async () => "synthetic-signature") };
    const provider = createTestProvider({ account: account as never, transport: transport as never, allowOrderSigning: true });
    const typed = {
      primaryType: "Order", domain: { name: "Gnosis Protocol", version: "v2", chainId: 11155111, verifyingContract: TEST_OPERATOR.settlement },
      types: { Order: [] },
      message: {
        sellToken: TEST_OPERATOR.weth, buyToken: TEST_OPERATOR.usdc,
        receiver: from, sellAmount: TEST_OPERATOR.sellBudget.toString(),
        buyAmount: "1000000", feeAmount: "0", appData: "0x" + "a".repeat(64),
        validTo: Math.floor(Date.now()/1000)+600, kind: "sell",
        partiallyFillable: false, sellTokenBalance: "erc20", buyTokenBalance: "erc20",
      },
    };
    const request = { method: "eth_signTypedData_v4", params: [from, JSON.stringify(typed)] };
    await expect(provider.request(request as never)).rejects.toThrow("AUTONOMOUS_ORDER_NOT_AUTHORIZED");
    provider.armReviewedOrder({ quoteId: 123, verified: true, expiresAt: new Date(Date.now()+60000).toISOString(), appDataHash: typed.message.appData, minimumBuy: 1000000n });
    await expect(provider.request({ method: "eth_signTypedData_v4", params: [from, JSON.stringify({ ...typed, message: { ...typed.message, buyAmount: "1" } })] } as never)).rejects.toThrow("AUTONOMOUS_ORDER_INTENT");
    await expect(provider.request(request as never)).resolves.toBe("synthetic-signature");
    await expect(provider.request(request as never)).rejects.toThrow("AUTONOMOUS_ORDER_NOT_AUTHORIZED");
    expect(account.signTypedData).toHaveBeenCalledTimes(1);
  });
});
