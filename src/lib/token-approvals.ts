import {
  createPublicClient,
  erc20Abi,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { publicRpc } from "./config";

export const APPROVAL_CHAIN_ID = 11155111 as const;
export const APPROVAL_COVERAGE =
  "Only the four listed Sepolia token/spender pairs were checked. Zero here does not mean this address has no other approvals.";
export const APPROVAL_TOKENS = [
  {
    id: "circle-test-usdc",
    label: "Circle test USDC",
    symbol: "USDC",
    address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    decimals: 6,
  },
  {
    id: "sepolia-weth",
    label: "Sepolia WETH",
    symbol: "WETH",
    address: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14",
    decimals: 18,
  },
] as const;
export const APPROVAL_SPENDERS = [
  {
    id: "uniswap-router-02",
    label: "Uniswap SwapRouter02",
    address: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  },
  {
    id: "cow-relayer",
    label: "CoW relayer",
    address: "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110",
  },
] as const;
export const MAX_BLOCK_AGE_MS = 180_000;

export type ApprovalIssue =
  | "TOKEN_CODE_UNAVAILABLE"
  | "SPENDER_CODE_UNAVAILABLE"
  | "DECIMALS_MISMATCH"
  | "BALANCE_UNAVAILABLE"
  | "ALLOWANCE_UNAVAILABLE"
  | "ALLOWANCE_IDENTITY_MISMATCH";
export type ApprovalRow = {
  tokenId: string;
  tokenLabel: string;
  tokenSymbol: string;
  tokenAddress: Address;
  spenderId: string;
  spenderLabel: string;
  spenderAddress: Address;
  state: "nonzero" | "zero" | "unavailable";
  rawAllowance: string | null;
  readableAllowance: string | null;
  verifiedDecimals: number | null;
  rawBalance: string | null;
  readableBalance: string | null;
  issue: ApprovalIssue | null;
  balanceIssue: "BALANCE_UNAVAILABLE" | null;
};
export type ApprovalReport = {
  schema: "pit.token-approvals.readonly.v1";
  chainId: typeof APPROVAL_CHAIN_ID;
  network: "Ethereum Sepolia";
  owner: Address;
  blockNumber: string;
  blockTimestamp: string;
  observedAt: string;
  coverage: typeof APPROVAL_COVERAGE;
  rows: ApprovalRow[];
};

export class ApprovalInspectionError extends Error {
  constructor(
    public readonly code:
      "INVALID_ADDRESS" | "WRONG_CHAIN" | "RPC_UNAVAILABLE" | "STALE_BLOCK",
  ) {
    super(code);
  }
}

export type ApprovalReadOps = {
  chainId(): Promise<number>;
  block(): Promise<{ number: bigint | null; timestamp: bigint }>;
  code(address: Address, blockNumber: bigint): Promise<Hex | undefined>;
  decimals(token: Address, blockNumber: bigint): Promise<number>;
  balance(token: Address, owner: Address, blockNumber: bigint): Promise<bigint>;
  allowance(
    token: Address,
    owner: Address,
    spender: Address,
    blockNumber: bigint,
  ): Promise<{ token: Address; spender: Address; value: bigint }>;
};

export function publicApprovalReadOps(): ApprovalReadOps {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(publicRpc[APPROVAL_CHAIN_ID][0], {
      timeout: 8000,
      retryCount: 0,
    }),
  });
  return {
    chainId: () => client.getChainId(),
    block: async () => {
      const block = await client.getBlock({ blockTag: "latest" });
      return { number: block.number, timestamp: block.timestamp };
    },
    code: (address, blockNumber) => client.getCode({ address, blockNumber }),
    decimals: async (token, blockNumber) =>
      Number(
        await client.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "decimals",
          blockNumber,
        }),
      ),
    balance: (token, owner, blockNumber) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
        blockNumber,
      }),
    allowance: async (token, owner, spender, blockNumber) => ({
      token,
      spender,
      value: await client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
        blockNumber,
      }),
    }),
  };
}

const hasCode = (value: PromiseSettledResult<Hex | undefined>) =>
  value.status === "fulfilled" && !!value.value && value.value !== "0x";
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function inspectTokenApprovals(
  input: string,
  ops: ApprovalReadOps = publicApprovalReadOps(),
  now: () => number = Date.now,
): Promise<ApprovalReport> {
  if (!isAddress(input.trim()))
    throw new ApprovalInspectionError("INVALID_ADDRESS");
  const owner = getAddress(input.trim());
  let chainId: number;
  let block: Awaited<ReturnType<ApprovalReadOps["block"]>>;
  try {
    chainId = await ops.chainId();
    if (chainId !== APPROVAL_CHAIN_ID)
      throw new ApprovalInspectionError("WRONG_CHAIN");
    block = await ops.block();
  } catch (error) {
    if (error instanceof ApprovalInspectionError) throw error;
    throw new ApprovalInspectionError("RPC_UNAVAILABLE");
  }
  const blockNumber = block.number;
  const blockMs = Number(block.timestamp) * 1000;
  if (
    blockNumber === null ||
    blockNumber < 0n ||
    !Number.isSafeInteger(blockMs)
  )
    throw new ApprovalInspectionError("RPC_UNAVAILABLE");
  if (blockMs > now() + 30_000 || now() - blockMs > MAX_BLOCK_AGE_MS)
    throw new ApprovalInspectionError("STALE_BLOCK");

  const addresses = [...APPROVAL_TOKENS, ...APPROVAL_SPENDERS];
  const codes = await Promise.allSettled(
    addresses.map((item) => ops.code(item.address as Address, blockNumber)),
  );
  const codePresent = new Map(
    addresses.map((item, index) => [
      item.address.toLowerCase(),
      hasCode(codes[index]),
    ]),
  );

  const contexts = await Promise.all(
    APPROVAL_TOKENS.map(async (token) => {
      if (!codePresent.get(token.address.toLowerCase()))
        return {
          decimals: null,
          balance: null,
          issue: "TOKEN_CODE_UNAVAILABLE" as ApprovalIssue,
        };
      const [decimals, balance] = await Promise.allSettled([
        ops.decimals(token.address as Address, blockNumber),
        ops.balance(token.address as Address, owner, blockNumber),
      ]);
      if (decimals.status !== "fulfilled" || decimals.value !== token.decimals)
        return {
          decimals: null,
          balance: null,
          issue: "DECIMALS_MISMATCH" as ApprovalIssue,
        };
      return {
        decimals: decimals.value,
        balance:
          balance.status === "fulfilled" &&
          typeof balance.value === "bigint" &&
          balance.value >= 0n
            ? balance.value
            : null,
        issue: null,
      };
    }),
  );

  const rows = await Promise.all(
    APPROVAL_TOKENS.flatMap((token, tokenIndex) =>
      APPROVAL_SPENDERS.map(async (spender): Promise<ApprovalRow> => {
        const context = contexts[tokenIndex];
        const base: ApprovalRow = {
          tokenId: token.id,
          tokenLabel: token.label,
          tokenSymbol: token.symbol,
          tokenAddress: token.address as Address,
          spenderId: spender.id,
          spenderLabel: spender.label,
          spenderAddress: spender.address as Address,
          state: "unavailable",
          rawAllowance: null,
          readableAllowance: null,
          verifiedDecimals: context.decimals,
          rawBalance: context.balance?.toString() ?? null,
          readableBalance:
            context.balance === null
              ? null
              : formatUnits(context.balance, token.decimals),
          issue: null,
          balanceIssue:
            context.decimals !== null && context.balance === null
              ? "BALANCE_UNAVAILABLE"
              : null,
        };
        if (context.issue) return { ...base, issue: context.issue };
        if (!codePresent.get(spender.address.toLowerCase()))
          return { ...base, issue: "SPENDER_CODE_UNAVAILABLE" };
        try {
          const answer = await ops.allowance(
            token.address as Address,
            owner,
            spender.address as Address,
            blockNumber,
          );
          if (
            !same(answer.token, token.address) ||
            !same(answer.spender, spender.address)
          )
            return { ...base, issue: "ALLOWANCE_IDENTITY_MISMATCH" };
          if (typeof answer.value !== "bigint" || answer.value < 0n)
            return { ...base, issue: "ALLOWANCE_UNAVAILABLE" };
          return {
            ...base,
            state: answer.value === 0n ? "zero" : "nonzero",
            rawAllowance: answer.value.toString(),
            readableAllowance: formatUnits(answer.value, token.decimals),
          };
        } catch {
          return { ...base, issue: "ALLOWANCE_UNAVAILABLE" };
        }
      }),
    ),
  );
  if (now() - blockMs > MAX_BLOCK_AGE_MS)
    throw new ApprovalInspectionError("STALE_BLOCK");
  return {
    schema: "pit.token-approvals.readonly.v1",
    chainId: APPROVAL_CHAIN_ID,
    network: "Ethereum Sepolia",
    owner,
    blockNumber: blockNumber.toString(),
    blockTimestamp: new Date(blockMs).toISOString(),
    observedAt: new Date(now()).toISOString(),
    coverage: APPROVAL_COVERAGE,
    rows,
  };
}

export function approvalReportJSON(report: ApprovalReport): string {
  if (
    report.schema !== "pit.token-approvals.readonly.v1" ||
    report.chainId !== APPROVAL_CHAIN_ID ||
    report.rows.length !== 4 ||
    report.coverage !== APPROVAL_COVERAGE ||
    report.rows.some((row, index) => {
      const token =
        APPROVAL_TOKENS[Math.floor(index / APPROVAL_SPENDERS.length)];
      const spender = APPROVAL_SPENDERS[index % APPROVAL_SPENDERS.length];
      return (
        row.tokenId !== token.id ||
        row.spenderId !== spender.id ||
        !same(row.tokenAddress, token.address) ||
        !same(row.spenderAddress, spender.address)
      );
    })
  )
    throw new Error("INVALID_APPROVAL_REPORT");
  return JSON.stringify(report, null, 2) + "\n";
}

export function sepoliaAddressUrl(address: Address): string {
  return `${sepolia.blockExplorers.default.url}/address/${getAddress(address)}`;
}
