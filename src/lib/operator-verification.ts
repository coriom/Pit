import { OrderBookApi } from "@cowprotocol/cow-sdk";
import {
  createPublicClient,
  decodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { COW_RELEASE } from "./execution-preflight";
import { OBSERVER_INTENT, OBSERVER_RPC_URL } from "./operator-observer";
export {
  OBSERVER_RPC_URL,
  observeCowOperator,
  publicOperatorObserverOps,
} from "./operator-observer";

const txHashPattern = /^0x[0-9a-fA-F]{64}$/;
const uidPattern = /^0x[0-9a-fA-F]{112}$/;
export interface PublicVerificationOps {
  chainId(): Promise<number>;
  transaction(hash: Hex): Promise<{
    from: Address;
    to: Address | null;
    input: Hex;
    value: bigint;
  }>;
  receipt(
    hash: Hex,
  ): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
  allowance(owner: Address): Promise<bigint>;
  order(uid: string): Promise<{
    owner: string;
    sellToken: string;
    buyToken: string;
    status: string;
    executedSellAmount: string;
    executedBuyAmount: string;
  }>;
  trades(uid: string): Promise<
    readonly {
      orderUid: string;
      owner: string;
      txHash?: string | null;
      sellAmount: string;
      sellAmountBeforeFees: string;
      buyAmount: string;
      blockNumber: number;
      logIndex: number;
    }[]
  >;
}

export function publicVerificationOps(
  rpcFetch?: typeof fetch,
): PublicVerificationOps {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(OBSERVER_RPC_URL, {
      timeout: 12000,
      retryCount: 0,
      ...(rpcFetch ? { fetchFn: rpcFetch } : {}),
    }),
  });
  const book = new OrderBookApi({
    chainId: 11155111,
    env: "prod",
    baseUrls: { 11155111: COW_RELEASE.api } as never,
    backoffOpts: { numOfAttempts: 1 },
  });
  return {
    chainId: () => client.getChainId(),
    transaction: (hash) => client.getTransaction({ hash }),
    receipt: (hash) => client.getTransactionReceipt({ hash }),
    allowance: (owner) =>
      client.readContract({
        address: OBSERVER_INTENT.sellToken,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, OBSERVER_INTENT.approvalTarget],
      }),
    order: (uid) => book.getOrder(uid as never),
    trades: (uid) => book.getTrades({ orderUid: uid as never }),
  };
}

export async function verifyPublicApproval(
  account: string,
  hash: string,
  ops: PublicVerificationOps = publicVerificationOps(),
) {
  if (!isAddress(account) || !txHashPattern.test(hash))
    throw new Error("Invalid public account or approval transaction hash");
  if ((await ops.chainId()) !== COW_RELEASE.chainId)
    throw new Error("Wrong RPC chain for approval verification");
  const [tx, receipt] = await Promise.all([
    ops.transaction(hash as Hex),
    ops.receipt(hash as Hex),
  ]);
  if (
    tx.from.toLowerCase() !== account.toLowerCase() ||
    tx.to?.toLowerCase() !== OBSERVER_INTENT.sellToken.toLowerCase() ||
    tx.value !== 0n ||
    receipt.status !== "success"
  )
    throw new Error(
      "Approval transaction account, token, value or receipt mismatch",
    );
  let spender: string;
  let amount: bigint;
  try {
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
    if (decoded.functionName !== "approve")
      throw new Error("Not ERC-20 approve");
    [spender, amount] = decoded.args;
  } catch {
    throw new Error("Transaction does not encode ERC-20 approve");
  }
  if (
    spender.toLowerCase() !== OBSERVER_INTENT.approvalTarget.toLowerCase() ||
    amount < BigInt(OBSERVER_INTENT.sellAmount)
  )
    throw new Error(
      "Approval spender or amount is not the reviewed requirement",
    );
  const refreshedAllowance = await ops.allowance(account as Address);
  return {
    mode: "READ_ONLY_PUBLIC_VERIFICATION" as const,
    kind: "cow-approval" as const,
    account,
    chainId: COW_RELEASE.chainId,
    txHash: hash,
    token: OBSERVER_INTENT.sellToken,
    spender,
    approvedAmount: amount.toString(),
    currentAllowance: refreshedAllowance.toString(),
    blockNumber: receipt.blockNumber.toString(),
    verified: refreshedAllowance >= BigInt(OBSERVER_INTENT.sellAmount),
    nextAction:
      refreshedAllowance >= BigInt(OBSERVER_INTENT.sellAmount)
        ? "Obtain a NEW wallet-bound executable CoW quote in PIT, review its GREEN preflight, then separately authorize any order signature. Observer quotes remain non-executable."
        : "STOP — receipt succeeded but current allowance is below the required amount.",
  };
}

export async function verifyPublicOrder(
  account: string,
  uid: string,
  ops: PublicVerificationOps = publicVerificationOps(),
) {
  if (!isAddress(account) || !uidPattern.test(uid))
    throw new Error("Invalid public account or CoW order UID");
  if ((await ops.chainId()) !== COW_RELEASE.chainId)
    throw new Error("Wrong RPC chain for order verification");
  const [order, fills] = await Promise.all([ops.order(uid), ops.trades(uid)]);
  if (
    order.owner.toLowerCase() !== account.toLowerCase() ||
    order.sellToken.toLowerCase() !== OBSERVER_INTENT.sellToken.toLowerCase() ||
    order.buyToken.toLowerCase() !== OBSERVER_INTENT.buyToken.toLowerCase()
  )
    throw new Error("Order account or token pair mismatch");
  if (
    fills.some(
      (fill) =>
        fill.orderUid.toLowerCase() !== uid.toLowerCase() ||
        fill.owner.toLowerCase() !== account.toLowerCase(),
    )
  )
    throw new Error("Fill account or order UID mismatch");
  const aggregate = (
    field: "sellAmount" | "sellAmountBeforeFees" | "buyAmount",
  ) => fills.reduce((sum, fill) => sum + BigInt(fill[field]), 0n).toString();
  return {
    mode: "READ_ONLY_PUBLIC_VERIFICATION" as const,
    kind: "cow-order" as const,
    account,
    chainId: COW_RELEASE.chainId,
    orderUid: uid,
    status: order.status,
    executedSellAmount: order.executedSellAmount,
    executedBuyAmount: order.executedBuyAmount,
    fills: fills.map((fill) => ({
      txHash: fill.txHash ?? null,
      sellAmount: fill.sellAmount,
      sellAmountBeforeFees: fill.sellAmountBeforeFees,
      buyAmount: fill.buyAmount,
      blockNumber: fill.blockNumber,
      logIndex: fill.logIndex,
    })),
    fillTotals: {
      sellAmount: aggregate("sellAmount"),
      sellAmountBeforeFees: aggregate("sellAmountBeforeFees"),
      buyAmount: aggregate("buyAmount"),
    },
    terminal: ["fulfilled", "cancelled", "expired"].includes(order.status),
    nextAction:
      order.status === "fulfilled" && fills.length
        ? "Reconcile these public fills against PIT IndexedDB, Taxlot CSV and the real importer on the approved browser origin. A public order alone does not prove local accounting."
        : "No confirmed fill to reconcile. Do not retry or resubmit an order automatically.",
  };
}
