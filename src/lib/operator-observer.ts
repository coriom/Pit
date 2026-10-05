import {
  OrderBookApi,
  OrderQuoteSideKindSell,
  PriceQuality,
  SigningScheme,
  getQuoteAmountsAndCosts,
} from "@cowprotocol/cow-sdk";
import {
  createPublicClient,
  erc20Abi,
  http,
  isAddress,
  keccak256,
  type Address,
} from "viem";
import { sepolia } from "viem/chains";
import { config, publicRpc } from "./config";
import { COW_RELEASE } from "./execution-preflight";
import { assertVerifiedTokenMetadata, quoteMarkets } from "./quote-markets";
import {
  cowObservationReadiness,
  type ObservationFact,
} from "./operator-readiness";
import { normalizeCowQuote, type NormalizedQuote } from "./swap-quotes";

// This is a public, read-only observation intent, never an execution allowlist.
const market = quoteMarkets[0];
export const OBSERVER_RPC_URL = publicRpc[11155111][0];
export const OBSERVER_INTENT = Object.freeze({
  chainId: COW_RELEASE.chainId,
  sellToken: market.buy.address,
  buyToken: market.sell.address,
  sellDecimals: market.buy.decimals,
  buyDecimals: market.sell.decimals,
  sellAmount: "1000000",
  sellDisplayAmount: "1",
  approvalTarget: COW_RELEASE.relayer,
});

export type ObserverQuote = Readonly<{
  id: string | number | null;
  verified: boolean;
  from: string;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  feeAmount: string;
  expiration: string;
  protocolFeeBps: string;
  quote: Parameters<typeof getQuoteAmountsAndCosts>[0]["orderParams"];
}>;

export interface OperatorObserverOps {
  chainId(): Promise<number>;
  block(): Promise<{ number: bigint; hash: string }>;
  codeHash(address: Address, block: bigint): Promise<string | null>;
  decimals(address: Address, block: bigint): Promise<number>;
  ethBalance(address: Address, block: bigint): Promise<bigint>;
  tokenBalance(
    token: Address,
    address: Address,
    block: bigint,
  ): Promise<bigint>;
  allowance(
    token: Address,
    owner: Address,
    spender: Address,
    block: bigint,
  ): Promise<bigint>;
  approvalGas(
    token: Address,
    owner: Address,
    spender: Address,
    amount: bigint,
  ): Promise<bigint>;
  gasPrice(): Promise<bigint>;
  cowQuote(from: Address, sellAmount: string): Promise<ObserverQuote>;
}

export const safeObserverError = (error: unknown) => {
  const api = error as {
    response?: { status?: unknown };
    body?: { errorType?: unknown; description?: unknown };
  } | null;
  if (
    Number.isInteger(api?.response?.status) &&
    typeof api?.body?.errorType === "string" &&
    /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(api.body.errorType) &&
    typeof api.body.description === "string" &&
    /^[A-Za-z0-9 .,:'-]{1,160}$/.test(api.body.description)
  )
    return `HTTP ${api.response!.status} ${api.body.errorType}: ${api.body.description}`;
  const message = error instanceof Error ? error.message : String(error);
  // Keep the upstream error category without echoing arbitrary URLs, headers or secrets.
  return message.replace(/https?:\/\/\S+/g, "[endpoint]").slice(0, 400);
};
const fact = (
  status: ObservationFact["status"],
  evidence: string,
): ObservationFact => ({ status, evidence });
const unknown = (error: unknown) => fact("UNKNOWN", safeObserverError(error));

export function publicOperatorObserverOps(
  rpcFetch?: typeof fetch,
): OperatorObserverOps {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(OBSERVER_RPC_URL, {
      timeout: 12000,
      retryCount: 0,
      ...(rpcFetch ? { fetchFn: rpcFetch } : {}),
    }),
  });
  const orderbook = new OrderBookApi({
    chainId: 11155111,
    env: "prod",
    baseUrls: { 11155111: COW_RELEASE.api } as never,
    backoffOpts: { numOfAttempts: 1 },
  });
  return {
    chainId: () => client.getChainId(),
    block: async () => {
      const block = await client.getBlock();
      if (!block.hash) throw new Error("RPC block has no hash");
      return { number: block.number, hash: block.hash };
    },
    codeHash: async (address, blockNumber) => {
      const code = await client.getCode({ address, blockNumber });
      return code && code !== "0x" ? `hex:${keccak256(code).slice(2)}` : null;
    },
    decimals: async (address, blockNumber) =>
      Number(
        await client.readContract({
          address,
          abi: erc20Abi,
          functionName: "decimals",
          blockNumber,
        }),
      ),
    ethBalance: (address, blockNumber) =>
      client.getBalance({ address, blockNumber }),
    tokenBalance: (token, address, blockNumber) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
        blockNumber,
      }),
    allowance: (token, owner, spender, blockNumber) =>
      client.readContract({
        address: token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [owner, spender],
        blockNumber,
      }),
    approvalGas: (token, owner, spender, amount) =>
      client.estimateContractGas({
        account: owner,
        address: token,
        abi: erc20Abi,
        functionName: "approve",
        args: [spender, amount],
      }),
    gasPrice: () => client.getGasPrice(),
    cowQuote: (from, sellAmount) =>
      orderbook.getQuote({
        from,
        sellToken: OBSERVER_INTENT.sellToken,
        buyToken: OBSERVER_INTENT.buyToken,
        kind: OrderQuoteSideKindSell.SELL,
        sellAmountBeforeFee: sellAmount,
        validFor: 1200,
        priceQuality: PriceQuality.VERIFIED,
        signingScheme: SigningScheme.EIP712,
      }) as Promise<ObserverQuote>,
  };
}

export type OperatorObservation = Readonly<{
  mode: "READ_ONLY_OBSERVER";
  account: string;
  browserOrigin: string | null;
  observedAt: string;
  block: { number: string; hash: string } | null;
  intent: typeof OBSERVER_INTENT;
  chainId: number | null;
  ethWei: string | null;
  sellBalance: string | null;
  buyBalance: string | null;
  allowance: string | null;
  approvalRequired: boolean | null;
  approvalGasUnits: string | null;
  approvalGasPriceWei: string | null;
  quote:
    | (Omit<
        NormalizedQuote,
        | "sellAmount"
        | "swapInputSellAmount"
        | "buyAmount"
        | "minimumReceiveBuyAmount"
        | "protocolFee"
        | "networkCostSellAmount"
        | "estimatedGasUnits"
        | "pitFeeBuyAmount"
      > & {
        id: string | number | null;
        verified: boolean;
        sellAmount: string;
        swapInputSellAmount: string;
        buyAmount: string;
        minimumReceiveBuyAmount: string | null;
        protocolFee: {
          amount: string | null;
          token: "buy" | "sell";
          ratePpm: number | null;
          includedInBuyAmount: true;
        };
        networkCostSellAmount: string | null;
        estimatedGasUnits: string | null;
        pitFeeBuyAmount: string;
      })
    | null;
  quoteError: string | null;
  readiness: ReturnType<typeof cowObservationReadiness>;
  observerReady: boolean;
  walletExecutionReady: false;
  handoff: null | Readonly<{
    action: "ERC20_APPROVAL" | "COW_ORDER_REVIEW";
    wallet: string;
    network: "Ethereum Sepolia 11155111";
    token: string;
    spender: string;
    requiredAllowance: string;
    currentAllowance: string;
    estimatedApprovalGasUnits: string | null;
    quoteExpiresAt: string;
    executableQuoteRequired: true;
    submitted: false;
  }>;
  nextAction: string;
}>;

export async function observeCowOperator(
  account: string,
  ops: OperatorObserverOps = publicOperatorObserverOps(),
  now = () => Date.now(),
  browser?: { origin: string; storage: ObservationFact },
): Promise<OperatorObservation> {
  if (!isAddress(account)) throw new Error("Invalid public EVM address");
  const owner = account as Address;
  const sell = OBSERVER_INTENT.sellToken as Address;
  const buy = OBSERVER_INTENT.buyToken as Address;
  const spender = OBSERVER_INTENT.approvalTarget as Address;
  const units = BigInt(OBSERVER_INTENT.sellAmount);
  const facts: Record<string, ObservationFact> = {
    chain: fact("UNKNOWN", "Sepolia RPC chain ID not read"),
    "cow-environment": fact("UNKNOWN", "Pinned CoW contracts not read"),
    fees:
      config.FEES_ENABLED || config.MAINNET_ENABLED
        ? fact("FAIL", "Release fee or mainnet flag enabled")
        : fact("PASS", "FEES_ENABLED=false; MAINNET_ENABLED=false"),
    assets: fact("UNKNOWN", "ERC-20 code and decimals not read"),
    funds: fact("UNKNOWN", "Balances and approval gas not read"),
    storage:
      browser?.storage ??
      fact("UNKNOWN", "CLI cannot inspect browser origin or IndexedDB"),
    quote: fact("UNKNOWN", "No fresh CoW public-address quote"),
  };
  let chainId: number | null = null;
  let block: { number: string; hash: string } | null = null;
  let ethWei: string | null = null;
  let sellBalance: string | null = null;
  let buyBalance: string | null = null;
  let allowance: string | null = null;
  let approvalRequired: boolean | null = null;
  let approvalGasUnits: string | null = null;
  let approvalGasPriceWei: string | null = null;
  let quote: OperatorObservation["quote"] = null;
  let quoteError: string | null = null;
  if (facts.fees.status === "PASS") {
    try {
      chainId = await ops.chainId();
      facts.chain =
        chainId === COW_RELEASE.chainId
          ? fact("PASS", `RPC eth_chainId=${chainId}`)
          : fact("FAIL", `RPC eth_chainId=${chainId}; expected 11155111`);
    } catch (error) {
      facts.chain = unknown(error);
    }
  }
  if (facts.chain.status === "PASS") {
    try {
      const observedBlock = await ops.block();
      block = {
        number: observedBlock.number.toString(),
        hash: observedBlock.hash,
      };
      const [
        sellCode,
        buyCode,
        settlementCode,
        relayerCode,
        sellDecimals,
        buyDecimals,
        eth,
        sellAmount,
        buyAmount,
        currentAllowance,
      ] = await Promise.all([
        ops.codeHash(sell, observedBlock.number),
        ops.codeHash(buy, observedBlock.number),
        ops.codeHash(COW_RELEASE.settlement, observedBlock.number),
        ops.codeHash(spender, observedBlock.number),
        ops.decimals(sell, observedBlock.number),
        ops.decimals(buy, observedBlock.number),
        ops.ethBalance(owner, observedBlock.number),
        ops.tokenBalance(sell, owner, observedBlock.number),
        ops.tokenBalance(buy, owner, observedBlock.number),
        ops.allowance(sell, owner, spender, observedBlock.number),
      ]);
      ethWei = eth.toString();
      sellBalance = sellAmount.toString();
      buyBalance = buyAmount.toString();
      allowance = currentAllowance.toString();
      const tokenEvidence = [
        {
          address: buy,
          codePresent: !!buyCode,
          codeKeccak256: buyCode,
          decimals: buyDecimals,
        },
        {
          address: sell,
          codePresent: !!sellCode,
          codeKeccak256: sellCode,
          decimals: sellDecimals,
        },
      ];
      try {
        assertVerifiedTokenMetadata(market, tokenEvidence);
        facts.assets = fact(
          "PASS",
          `Pinned ERC-20 code hashes and decimals ${sellDecimals}/${buyDecimals} at block ${block.number}`,
        );
      } catch (error) {
        facts.assets = fact("FAIL", safeObserverError(error));
      }
      facts["cow-environment"] =
        settlementCode && relayerCode
          ? fact(
              "PASS",
              `CoW Sepolia API ${COW_RELEASE.api}; settlement and relayer code present at block ${block.number}`,
            )
          : fact("FAIL", "Pinned CoW settlement or relayer has no code");
      approvalRequired = currentAllowance < units;
      if (approvalRequired) {
        try {
          const [estimatedGas, gasPrice] = await Promise.all([
            ops.approvalGas(sell, owner, spender, units),
            ops.gasPrice(),
          ]);
          approvalGasUnits = estimatedGas.toString();
          approvalGasPriceWei = gasPrice.toString();
        } catch (error) {
          facts.funds = unknown(error);
        }
      }
      if (
        facts.assets.status === "PASS" &&
        facts["cow-environment"].status === "PASS"
      ) {
        if (
          sellAmount < units ||
          eth === 0n ||
          (approvalRequired &&
            approvalGasUnits !== null &&
            approvalGasPriceWei !== null &&
            eth < BigInt(approvalGasUnits) * BigInt(approvalGasPriceWei) * 2n)
        )
          facts.funds = fact(
            "FAIL",
            `ETH wei=${eth}; sell balance=${sellAmount}; required sell=${units}`,
          );
        else if (!approvalRequired || approvalGasUnits !== null)
          facts.funds = fact(
            "PASS",
            `ETH wei=${eth}; sell balance=${sellAmount}; allowance=${currentAllowance}; approval gas=${approvalGasUnits ?? "not required"}`,
          );
      }
    } catch (error) {
      facts.assets = unknown(error);
      facts["cow-environment"] = unknown(error);
      facts.funds = unknown(error);
    }
  }
  if (
    ["chain", "cow-environment", "assets", "funds", "fees"].every(
      (id) => facts[id].status === "PASS",
    )
  ) {
    try {
      const response = await ops.cowQuote(owner, OBSERVER_INTENT.sellAmount);
      const expirationMs = Date.parse(response.expiration);
      const orderValidToMs = Number(response.quote.validTo) * 1000;
      const protocolFeeBps = Number(response.protocolFeeBps ?? "0");
      if (
        response.verified !== true ||
        response.from.toLowerCase() !== owner.toLowerCase() ||
        response.quote.sellToken.toLowerCase() !== sell.toLowerCase() ||
        response.quote.buyToken.toLowerCase() !== buy.toLowerCase() ||
        response.quote.kind !== "sell" ||
        BigInt(response.quote.sellAmount) + BigInt(response.quote.feeAmount) !==
          units ||
        !Number.isFinite(expirationMs) ||
        expirationMs <= now() ||
        !Number.isSafeInteger(orderValidToMs) ||
        orderValidToMs <= now() ||
        !Number.isInteger(protocolFeeBps) ||
        protocolFeeBps < 0 ||
        protocolFeeBps > 10000
      )
        throw new Error(
          "INVALID_RESPONSE: verified CoW observer quote context",
        );
      const amounts = getQuoteAmountsAndCosts({
        orderParams: response.quote,
        slippagePercentBps: 50,
        partnerFeeBps: 0,
        protocolFeeBps,
      });
      const observedAt = now();
      const normalized = normalizeCowQuote({
        quoteResults: { amountsAndCosts: amounts },
        units,
        sellDecimals: OBSERVER_INTENT.sellDecimals,
        buyDecimals: OBSERVER_INTENT.buyDecimals,
        sellToken: sell,
        buyToken: buy,
        owner,
        chainId: COW_RELEASE.chainId,
        obtainedAt: observedAt,
      } as never);
      const expiresAtMs = Math.min(
        observedAt + 60000,
        expirationMs,
        orderValidToMs,
      );
      quote = {
        ...normalized,
        id: response.id,
        verified: true,
        executableThroughPit: false,
        diagnosticOnly: true,
        expiresAtMs,
        sellAmount: normalized.sellAmount.toString(),
        swapInputSellAmount: normalized.swapInputSellAmount.toString(),
        buyAmount: normalized.buyAmount.toString(),
        minimumReceiveBuyAmount:
          normalized.minimumReceiveBuyAmount?.toString() ?? null,
        protocolFee: {
          ...normalized.protocolFee,
          amount: normalized.protocolFee.amount?.toString() ?? null,
        },
        networkCostSellAmount:
          normalized.networkCostSellAmount?.toString() ?? null,
        estimatedGasUnits: null,
        pitFeeBuyAmount: normalized.pitFeeBuyAmount.toString(),
      };
      facts.quote = fact(
        "PASS",
        `Verified read-only CoW quote id=${response.id ?? "unavailable"}; from=${owner}; expires=${new Date(expiresAtMs).toISOString()}; non-executable`,
      );
    } catch (error) {
      quoteError = safeObserverError(error);
      facts.quote = fact(
        /\bNoLiquidity\b|\bUnsupportedToken\b|INVALID_RESPONSE/.test(quoteError)
          ? "FAIL"
          : "UNKNOWN",
        quoteError,
      );
    }
  }
  const readiness = cowObservationReadiness({ account: owner, facts });
  const observerReady = [
    "chain",
    "cow-environment",
    "fees",
    "assets",
    "funds",
    "quote",
  ].every((id) => facts[id].status === "PASS");
  const handoff: OperatorObservation["handoff"] =
    observerReady && quote && allowance !== null
      ? {
          action: approvalRequired ? "ERC20_APPROVAL" : "COW_ORDER_REVIEW",
          wallet: owner,
          network: "Ethereum Sepolia 11155111",
          token: sell,
          spender,
          requiredAllowance: units.toString(),
          currentAllowance: allowance,
          estimatedApprovalGasUnits: approvalGasUnits,
          quoteExpiresAt: new Date(quote.expiresAtMs).toISOString(),
          executableQuoteRequired: true,
          submitted: false,
        }
      : null;
  const nextAction = observerReady
    ? approvalRequired
      ? "ACTION REQUIRED — ERC-20 APPROVAL; operator must connect the external wallet, obtain a NEW wallet-bound executable quote in PIT, review its exact values, and approve only after the app's GREEN execution preflight and explicit checkpoint. The observer quote is not executable."
      : "ACTION REQUIRED — obtain a NEW wallet-bound executable quote in PIT and review its GREEN preflight before any CoW order signature. The observer quote is not executable."
    : "STOP — read-only observer readiness is incomplete; no wallet action is authorized.";
  return {
    mode: "READ_ONLY_OBSERVER",
    account: owner,
    browserOrigin: browser?.origin ?? null,
    observedAt: new Date(now()).toISOString(),
    block,
    intent: OBSERVER_INTENT,
    chainId,
    ethWei,
    sellBalance,
    buyBalance,
    allowance,
    approvalRequired,
    approvalGasUnits,
    approvalGasPriceWei,
    quote,
    quoteError,
    readiness,
    observerReady,
    walletExecutionReady: false,
    handoff,
    nextAction,
  };
}
