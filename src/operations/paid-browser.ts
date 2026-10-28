import {
  createPublicClient, createWalletClient, custom, http, decodeEventLog, encodeFunctionData, keccak256, stringToHex, formatUnits,
  type Abi, type Address, type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { contracts } from "./generated/contracts";
import { paidLocalArtifacts } from "./generated/paid-local";
import { matchesReviewedRuntime } from "./lib/reviewed-runtime";
import { parseRecipientsCsv, positiveUnits, requiredAddress, utcSeconds } from "./lib/inputs";
import { formatLocalQuote, newIntentId, priceForPaidOperation, type LocalQuote, type PaidKind } from "./lib/paid-local";
import { PIT_PRICES } from "../lib/pit-pricing";

// This entire module is imported only by the local operations build and requires loopback + Anvil.
const RPC = "http://127.0.0.1:8545";
const merchant = "0x0000000000000000000000000000000000000FEE" as Address; // Anvil fixture, never a live payout address.
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC, { timeout: 10_000 }) });
const paidAbi = paidLocalArtifacts.PitPaidOperations.abi as Abi;
const creatorAbi = paidLocalArtifacts.PitPaidTokenCreator.abi as Abi;
const mockAbi = paidLocalArtifacts.PitMockUSDC.abi as Abi;
const tokenAbi = contracts.PitStandardToken.abi as Abi;
const advancedAbi = contracts.PitAdvancedToken.abi as Abi;
const lockAbi = contracts.PitTokenLock.abi as Abi;
const vestAbi = contracts.PitTokenVesting.abi as Abi;
const root = document.querySelector<HTMLElement>("#operation-root");
const kind = root?.dataset.operation as PaidKind | undefined;
const sessionKey = "pit-paid-local-routers-v2";
const pendingKey = "pit-paid-local-pending-v1";

type Prepared = { functionName: string; args: readonly unknown[]; token?: Address; amount?: bigint;
  beneficiary?: Address; recipients?: { address: Address; amount: bigint; before: bigint }[];
  total?: bigint; supply?: bigint; advanced?: boolean; assetBefore?: bigint; decimals?: number; };
type Pending = { hash: Hex; intentId: Hex; operation: PaidKind; payer: Address; router: Address; fee: string; requestHash: Hex; operationCode: Hex };

const input = (name: string, label: string, placeholder = "") => `<label>${label}<input name="${name}" required placeholder="${placeholder}" autocomplete="off" /></label>`;
const tokenInput = input("token", "ERC-20 asset contract", "0x…");
const amountInput = input("amount", "Asset amount", "100");
const beneficiaryInput = input("beneficiary", "Immutable beneficiary", "0x…");
const forms: Record<PaidKind, string> = {
  "token-creator": `<div class="field-grid"><label>Preset<select name="preset"><option value="standard">Standard fixed supply</option><option value="advanced">Advanced roles and cap</option></select></label>${input("name", "Name", "Local Token")}${input("symbol", "Symbol", "LOC")}${input("supply", "Initial supply (18 decimals)", "1000")}${input("recipient", "Initial supply recipient", "0x…")}<label>Advanced cap (18 decimals)<input name="cap" placeholder="2000" autocomplete="off" /></label></div><label><input type="checkbox" name="minting"/> Creator may mint to cap</label><label><input type="checkbox" name="burning"/> Holders may burn</label><label><input type="checkbox" name="pausing"/> Creator may pause transfers</label>`,
  multisender: `${tokenInput}<label>Recipients CSV (address,amount; 1–100 distinct)<textarea name="recipients" required placeholder="address,amount&#10;0x…,10"></textarea></label><label>Import local CSV (maximum 256 KiB)<input id="paid-csv" type="file" accept=".csv,text/csv" /></label>`,
  "token-locker": `<div class="field-grid">${tokenInput}${amountInput}${beneficiaryInput}${input("unlock", "Unlock UTC (YYYY-MM-DDTHH:mm)", "2030-01-01T12:00")}</div>`,
  "token-vesting": `<div class="field-grid">${tokenInput}${amountInput}${beneficiaryInput}${input("start", "Start UTC", "2030-01-01T12:00")}${input("durationDays", "Duration in whole days", "30")}<label>Cliff UTC (blank means start)<input name="cliff" placeholder="2030-01-02T12:00" autocomplete="off" /></label></div>`,
};

if (root && kind && forms[kind]) boot();

function boot() {
  root!.innerHTML = `<section class="panel"><h2>Local mock-USDC payment</h2><p>Only loopback Anvil chain 31337. The mock token is not Circle USDC; fees go to a fixed local fixture address. No account, real money or remote broadcast.</p><button id="paid-connect" type="button">Connect local wallet</button> <button id="paid-setup" type="button" disabled>Deploy local payment fixtures</button><p id="paid-wallet" role="status">Disconnected</p></section><form id="paid-form" class="panel"><h2>Configure ${kind}</h2>${forms[kind!]}<div class="actions"><button id="paid-review" type="submit">Validate and quote</button><button id="paid-approve" type="button" disabled>Approve exact amounts</button><button id="paid-simulate" type="button" disabled>Simulate and estimate gas</button><button id="paid-execute" type="button" disabled>Confirm atomic operation</button></div></form><section class="panel"><h2>Review and receipt</h2><p id="paid-state" role="status" aria-live="polite">Idle</p><output id="paid-output" aria-live="polite">Connect a disposable Anvil wallet.</output><div class="actions"><button id="paid-reconcile" type="button" hidden>Check pending receipt</button><button id="paid-download" type="button" hidden>Download JSON receipt</button></div></section><p class="muted">Existing lock and vesting claims remain free in the standard operation page. Direct public contract calls remain possible outside PIT's guided paid route.</p>`;
  const $ = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
  const form = $<HTMLFormElement>("#paid-form"), output = $<HTMLOutputElement>("#paid-output");
  const state = $<HTMLElement>("#paid-state"), walletState = $<HTMLElement>("#paid-wallet");
  const setupButton = $<HTMLButtonElement>("#paid-setup"), approveButton = $<HTMLButtonElement>("#paid-approve");
  const simulateButton = $<HTMLButtonElement>("#paid-simulate"), executeButton = $<HTMLButtonElement>("#paid-execute");
  const reconcileButton = $<HTMLButtonElement>("#paid-reconcile"), downloadButton = $<HTMLButtonElement>("#paid-download");
  let account: Address | undefined, router: Address | undefined, paymentToken: Address | undefined;
  let prepared: Prepared | undefined, quote: LocalQuote | undefined, simulated = false, busy = false;
  let inMemoryPending: Pending | undefined;
  let receiptExport: Record<string, string | number> | undefined;
  const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
  const set = (label: string, detail: string, error = false) => { state.textContent = label; output.textContent = detail; output.className = error ? "danger" : ""; };
  const invalidate = () => { prepared = undefined; quote = undefined; simulated = false; approveButton.disabled = true; simulateButton.disabled = true; executeButton.disabled = true; };
  const pending = (): Pending | undefined => { if (inMemoryPending) return inMemoryPending; try { const saved = JSON.parse(sessionStorage.getItem(pendingKey) ?? "null"); return saved?.hash && saved?.router ? saved : undefined; } catch { return undefined; } };
  const savePending = (item: Pending) => { inMemoryPending = item; try { sessionStorage.setItem(pendingKey, JSON.stringify(item)); } catch { /* In-memory guard remains active if storage is unavailable. */ } reconcileButton.hidden = false; };
  const activeAbi = kind === "token-creator" ? creatorAbi : paidAbi;
  const activeArtifact = kind === "token-creator" ? paidLocalArtifacts.PitPaidTokenCreator : paidLocalArtifacts.PitPaidOperations;
  const codeFor = (p: Prepared) => keccak256(stringToHex(p.functionName === "createStandard" ? "PIT_STANDARD_V1"
    : p.functionName === "createAdvanced" ? "PIT_ADVANCED_V1"
    : p.functionName === "multiSend" ? "PIT_MULTISEND_V1"
    : p.functionName === "createLock" ? "PIT_LOCK_V1" : "PIT_VESTING_V1"));
  async function guard() {
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Paid demo requires loopback hosting.");
    if (!window.ethereum) throw Error("No injected local wallet provider.");
    if (await window.ethereum.request({ method: "eth_chainId" }) !== "0x7a69" || await publicClient.getChainId() !== 31337) throw Error("Wrong network: only Anvil chain 31337 can sign.");
    const walletBlock = await window.ethereum.request({ method: "eth_getBlockByNumber", params: ["latest", false] }) as { number?: Hex; hash?: Hex } | null;
    if (!walletBlock?.number || !walletBlock.hash || !/^0x[0-9a-fA-F]+$/.test(walletBlock.number)) throw Error("Wallet did not provide a verifiable local block.");
    const localBlock = await publicClient.getBlock({ blockNumber: BigInt(walletBlock.number) });
    if (localBlock.hash?.toLowerCase() !== walletBlock.hash.toLowerCase()) throw Error("Wallet and loopback Anvil RPC do not share the same chain state.");
    if (!account) throw Error("Connect a local wallet first.");
    const accounts = await window.ethereum.request({ method: "eth_accounts" }) as string[];
    if (!accounts.some((entry) => entry.toLowerCase() === account!.toLowerCase())) { invalidate(); throw Error("Wallet account changed. Review again."); }
  }
  function wallet() { if (!account || !window.ethereum) throw Error("Wallet unavailable."); return createWalletClient({ account, chain: foundry, transport: custom(window.ethereum) }); }
  async function read(address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) {
    return publicClient.readContract({ address, abi, functionName, args });
  }
  async function confirmed(hash: Hex) {
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (receipt.status !== "success") throw Error(`Transaction reverted; service fee rolled back. Hash ${hash}. Network gas is not refunded.`);
    return receipt;
  }
  async function verifyFixture() {
    await guard();
    if (!router) throw Error("Initialize the local payment fixtures first.");
    const code = await publicClient.getCode({ address: router });
    if (!matchesReviewedRuntime(code, { code: activeArtifact.runtime as Hex, immutableReferences: activeArtifact.immutableReferences })) throw Error("Router bytecode differs from reviewed local build.");
    paymentToken = requiredAddress(await read(router, activeAbi, "paymentToken") as string);
    if ((await read(router, activeAbi, "feeRecipient") as string).toLowerCase() !== merchant.toLowerCase()) throw Error("Unexpected fee recipient.");
    const mockCode = await publicClient.getCode({ address: paymentToken });
    if (!matchesReviewedRuntime(mockCode, { code: paidLocalArtifacts.PitMockUSDC.runtime as Hex, immutableReferences: paidLocalArtifacts.PitMockUSDC.immutableReferences })) throw Error("Payment token is not the reviewed LOCAL MOCK USDC fixture.");
    if (await read(paymentToken, mockAbi, "decimals") !== 6 || await read(paymentToken, mockAbi, "symbol") !== "MOCK-USDC") throw Error("Wrong local payment token.");
  }
  async function deploy(abi: Abi, bytecode: Hex, args: readonly unknown[]) {
    await guard();
    const hash = await wallet().deployContract({ abi, bytecode, args, account: account!, chain: foundry });
    const receipt = await confirmed(hash);
    if (!receipt.contractAddress) throw Error(`Deployment receipt ${hash} lacks an address; inspect Anvil before retrying.`);
    return receipt.contractAddress;
  }
  async function write(address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
    await guard();
    await publicClient.simulateContract({ address, abi, functionName, args, account: account! });
    await guard();
    const hash = await wallet().writeContract({ address, abi, functionName, args, account: account!, chain: foundry });
    return confirmed(hash);
  }
  async function prepare(data: FormData): Promise<Prepared> {
    await verifyFixture();
    const token = kind === "token-creator" ? undefined : requiredAddress(value(data, "token"));
    if (kind === "token-creator") {
      const name = value(data, "name"), symbol = value(data, "symbol");
      if (!name || !symbol || name.length > 60 || symbol.length > 16 || /[\u0000-\u001f]/.test(name + symbol)) throw Error("Invalid token name or symbol.");
      const supply = positiveUnits(value(data, "supply"), 18), recipient = requiredAddress(value(data, "recipient"));
      const advanced = value(data, "preset") === "advanced";
      if (advanced) {
        const cap = positiveUnits(value(data, "cap"), 18);
        if (cap < supply) throw Error("Cap is lower than initial supply.");
        return { functionName: "createAdvanced", args: [{ name, symbol, supply, cap, recipient, minting: data.has("minting"), burning: data.has("burning"), pausing: data.has("pausing") }], supply, beneficiary: recipient, advanced };
      }
      return { functionName: "createStandard", args: [name, symbol, supply, recipient], supply, beneficiary: recipient, advanced };
    }
    if (!token || !await publicClient.getCode({ address: token })) throw Error("No asset token code at that address.");
    const decimals = Number(await read(token, tokenAbi, "decimals"));
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw Error("Unsupported token decimals.");
    if (kind === "multisender") {
      const parsed = parseRecipientsCsv(value(data, "recipients"), decimals, account);
      const recipients: { address: Address; amount: bigint; before: bigint }[] = [];
      for (const item of parsed.recipients) recipients.push({ ...item, before: await read(token, tokenAbi, "balanceOf", [item.address]) as bigint });
      const balance = await read(token, tokenAbi, "balanceOf", [account]) as bigint;
      if (balance < parsed.total) throw Error("Insufficient asset balance.");
      return { functionName: "multiSend", args: [token, parsed.recipients.map((r) => r.address), parsed.recipients.map((r) => r.amount)], token, recipients, total: parsed.total, assetBefore: balance, decimals };
    }
    const amount = positiveUnits(value(data, "amount"), decimals), beneficiary = requiredAddress(value(data, "beneficiary"));
    if ((await read(token, tokenAbi, "balanceOf", [account]) as bigint) < amount) throw Error("Insufficient asset balance.");
    const now = (await publicClient.getBlock()).timestamp;
    if (kind === "token-locker") {
      const unlock = utcSeconds(value(data, "unlock"));
      if (unlock <= now) throw Error("Unlock must be in the future.");
      return { functionName: "createLock", args: [token, amount, beneficiary, unlock], token, amount, beneficiary, decimals };
    }
    const start = utcSeconds(value(data, "start")), days = value(data, "durationDays");
    if (!/^[1-9]\d{0,4}$/.test(days)) throw Error("Duration must be 1–99,999 days.");
    const duration = BigInt(days) * 86400n;
    const cliff = value(data, "cliff") ? utcSeconds(value(data, "cliff")) : start;
    if (start <= now || cliff < start || cliff > start + duration) throw Error("Start or cliff is outside the supported schedule.");
    return { functionName: "createVesting", args: [{ token, amount, beneficiary, start, duration, cliff }], token, amount, beneficiary, decimals };
  }
  function operationSummary(p: Prepared) {
    if (p.functionName === "createStandard" || p.functionName === "createAdvanced") {
      return `Initial supply ${formatUnits(p.supply!, 18)} tokens to ${p.beneficiary}. ${p.advanced ? "Creator controls selected mint/burn/pause roles and delayed default administration." : "Fixed supply with no administrator."}`;
    }
    if (p.functionName === "multiSend") {
      return `Asset ${p.token}; ${p.recipients!.length} distinct recipients; total ${formatUnits(p.total!, p.decimals!)} tokens.\n${p.recipients!.map((r) => `${r.address}: ${formatUnits(r.amount, p.decimals!)} tokens`).join("\n")}`;
    }
    if (p.functionName === "createLock") return `Asset ${p.token}; ${formatUnits(p.amount!, p.decimals!)} tokens; immutable beneficiary ${p.beneficiary}; unlock ${new Date(Number(p.args[3]) * 1000).toISOString()}.`;
    const schedule = p.args[0] as { start: bigint; duration: bigint; cliff: bigint };
    return `Asset ${p.token}; ${formatUnits(p.amount!, p.decimals!)} tokens; immutable beneficiary ${p.beneficiary}; start ${new Date(Number(schedule.start) * 1000).toISOString()}, duration ${schedule.duration} seconds, cliff ${new Date(Number(schedule.cliff) * 1000).toISOString()}.`;
  }
  async function actualFee(p: Prepared) {
    const prices = await read(router!, activeAbi, "prices") as readonly bigint[];
    if (kind === "multisender") return read(router!, activeAbi, "multiFee", [p.recipients!.length]) as Promise<bigint>;
    return prices[kind === "token-creator" ? p.advanced ? 1 : 0 : kind === "token-locker" ? 5 : 6];
  }
  function argsWithQuote(p: Prepared, q: LocalQuote) { return [...p.args, { intentId: q.intentId, version: q.version, maxFee: q.maxAuthorizedServiceFeeMicro, deadline: q.expiresAt }]; }
  async function fresh(p: Prepared, q: LocalQuote) {
    await verifyFixture();
    if (account?.toLowerCase() !== q.payer.toLowerCase() || router?.toLowerCase() !== q.destination.toLowerCase()) throw Error("Account or destination changed.");
    const now = (await publicClient.getBlock()).timestamp;
    if (now > q.expiresAt || (await read(router!, activeAbi, "priceVersion") as bigint) !== q.version) throw Error("Quote expired or price version changed. Review again.");
    const onchainFee = await actualFee(p);
    if (onchainFee !== q.amountMicro || onchainFee !== priceForPaidOperation(kind!, p.recipients?.length ?? 0, p.advanced)) throw Error("On-chain fee differs from reviewed central pricing.");
    if (await read(router!, activeAbi, "usedIntent", [account, q.intentId])) throw Error("Intent already used. Review a new operation.");
    if ((await read(paymentToken!, mockAbi, "balanceOf", [account]) as bigint) < q.amountMicro) throw Error("Insufficient LOCAL MOCK USDC.");
    if (p.token && (await read(p.token, tokenAbi, "balanceOf", [account]) as bigint) < (p.total ?? p.amount ?? 0n)) throw Error("Insufficient asset balance.");
  }
  function pendingBlock() { if (pending()) throw Error("A submitted transaction has an uncertain receipt. Reconcile its hash before another paid operation."); }
  async function approveExact(token: Address, amount: bigint) {
    const current = await read(token, tokenAbi, "allowance", [account, router]) as bigint;
    if (current === amount) return;
    if (current > amount) throw Error(`Existing allowance ${current} exceeds required ${amount}. Revoke it via the free Allowance Manager before continuing.`);
    set("Awaiting approval", `Token ${token}\nSpender ${router}\nApprove exactly ${amount} raw units. This approval is separate and can consume gas.`);
    await write(token, tokenAbi, "approve", [router, amount]);
    if (await read(token, tokenAbi, "allowance", [account, router]) !== amount) throw Error("Approval receipt did not produce exact allowance.");
  }
  async function reconcile() {
    const item = pending(); if (!item) { reconcileButton.hidden = true; return; }
    if (item.payer.toLowerCase() !== account?.toLowerCase()) throw Error("Pending transaction belongs to another account.");
    const receipt = await publicClient.getTransactionReceipt({ hash: item.hash });
    if (receipt.status === "success") {
      const routerLogs = receipt.logs.filter((log) => log.address.toLowerCase() === item.router.toLowerCase());
      const fee = routerLogs.map((log) => { try { return decodeEventLog({ abi: activeAbi, data: log.data, topics: log.topics }); } catch { return undefined; } }).find((event) => event?.eventName === "FeePaid");
      const operation = routerLogs.map((log) => { try { return decodeEventLog({ abi: activeAbi, data: log.data, topics: log.topics }); } catch { return undefined; } }).find((event) => event?.eventName === "OperationExecuted");
      const paid = fee?.args as { payer?: Address; intentId?: Hex; amount?: bigint; recipient?: Address; operation?: Hex } | undefined;
      const done = operation?.args as { payer?: Address; intentId?: Hex; result?: Address; operation?: Hex; requestHash?: Hex } | undefined;
      const paymentTransfer = receipt.logs.filter((log) => log.address.toLowerCase() === paymentToken?.toLowerCase())
        .map((log) => { try { return decodeEventLog({ abi: mockAbi, data: log.data, topics: log.topics }); } catch { return undefined; } })
        .find((event) => event?.eventName === "Transfer" && (event.args as { from?: Address; to?: Address; value?: bigint }).from?.toLowerCase() === item.payer.toLowerCase()
          && (event.args as { to?: Address }).to?.toLowerCase() === merchant.toLowerCase()
          && (event.args as { value?: bigint }).value === BigInt(item.fee));
      if (receipt.to?.toLowerCase() !== item.router.toLowerCase() || paid?.payer?.toLowerCase() !== item.payer.toLowerCase()
        || paid?.intentId !== item.intentId || paid?.amount !== BigInt(item.fee) || paid?.recipient?.toLowerCase() !== merchant.toLowerCase()
        || paid?.operation !== item.operationCode || done?.operation !== item.operationCode || done?.requestHash !== item.requestHash
        || done?.intentId !== item.intentId || done?.payer?.toLowerCase() !== item.payer.toLowerCase() || !paymentTransfer) throw Error("Receipt is confirmed but fee/operation/token-transfer events do not match. Inspect chain manually.");
      let result = done.result ?? "0x0000000000000000000000000000000000000000";
      if (item.operation === "token-creator") {
        const abi = prepared?.advanced ? advancedAbi : tokenAbi;
        const supply = await read(result, abi, "totalSupply") as bigint;
        if (prepared?.supply !== undefined && supply !== prepared.supply) throw Error("Created supply differs from reviewed amount.");
        if (prepared?.beneficiary && await read(result, tokenAbi, "balanceOf", [prepared.beneficiary]) !== prepared.supply) throw Error("Initial recipient balance differs from reviewed supply.");
        if (prepared?.advanced) {
          const role = await read(result, advancedAbi, "DEFAULT_ADMIN_ROLE") as Hex;
          if (await read(result, advancedAbi, "hasRole", [role, item.payer]) !== true || await read(result, advancedAbi, "hasRole", [role, item.router]) !== false) throw Error("Advanced token roles differ from reviewed creator ownership.");
          const config = prepared.args[0] as { minting: boolean; burning: boolean; pausing: boolean };
          for (const [flag, expected] of [["mintingEnabled", config.minting], ["burningEnabled", config.burning], ["pausingEnabled", config.pausing]] as const) {
            if (await read(result, advancedAbi, flag) !== expected) throw Error(`Advanced ${flag} differs from reviewed configuration.`);
          }
        }
      } else if (item.operation === "multisender" && prepared?.recipients) {
        for (const recipient of prepared.recipients) if (await read(prepared.token!, tokenAbi, "balanceOf", [recipient.address]) !== recipient.before + recipient.amount) throw Error("Recipient balance readback differs from reviewed amount.");
        if (prepared.assetBefore !== undefined && await read(prepared.token!, tokenAbi, "balanceOf", [item.payer]) !== prepared.assetBefore - prepared.total!) throw Error("Payer asset balance differs from reviewed total.");
      } else if (item.operation === "token-locker" && prepared) {
        if (await read(result, lockAbi, "beneficiary") !== prepared.beneficiary || await read(result, lockAbi, "deposited") !== prepared.amount
          || await read(result, lockAbi, "unlockTime") !== prepared.args[3] || await read(prepared.token!, tokenAbi, "balanceOf", [result]) !== prepared.amount) throw Error("Lock state differs from reviewed funding.");
      } else if (item.operation === "token-vesting" && prepared) {
        const config = prepared.args[0] as { start: bigint; duration: bigint; cliff: bigint };
        if (await read(result, vestAbi, "beneficiary") !== prepared.beneficiary || await read(result, vestAbi, "allocation") !== prepared.amount || await read(result, vestAbi, "funded") !== true
          || await read(result, vestAbi, "start") !== config.start || await read(result, vestAbi, "duration") !== config.duration || await read(result, vestAbi, "cliff") !== config.cliff
          || await read(prepared.token!, tokenAbi, "balanceOf", [result]) !== prepared.amount) throw Error("Vesting state differs from reviewed funding.");
      }
      receiptExport = { chainId: 31337, operation: item.operation, payer: item.payer, intentId: item.intentId, requestHash: item.requestHash,
        transactionHash: item.hash, blockNumber: Number(receipt.blockNumber), status: "CONFIRMED", stateReadback: prepared ? "VERIFIED" : "NOT_VERIFIED_AFTER_REFRESH", feeToken: paymentToken ?? "local fixture",
        feeRaw: item.fee, feeRecipient: merchant, result, gasUsed: receipt.gasUsed.toString(), effectiveGasPriceWei: receipt.effectiveGasPrice.toString() };
      downloadButton.hidden = false;
      set(prepared ? "Success · receipt and state verified" : "Receipt confirmed · state readback needs revalidation", `Transaction ${item.hash}\nBlock ${receipt.blockNumber}\nPIT local mock-USDC fee ${formatUnits(BigInt(item.fee), 6)}\nResult ${result}\nGas ${receipt.gasUsed} units at ${receipt.effectiveGasPrice} wei. Existing claims remain free.`);
    } else set("Reverted · service fee rolled back", `Transaction ${item.hash} reverted. Network gas is not refunded.`, true);
    inMemoryPending = undefined;
    try { sessionStorage.removeItem(pendingKey); } catch { /* In-memory state was cleared after a confirmed receipt. */ }
    reconcileButton.hidden = true; invalidate();
  }

  $<HTMLButtonElement>("#paid-connect").addEventListener("click", async () => {
    try {
      if (!window.ethereum) throw Error("No injected local wallet.");
      if (await window.ethereum.request({ method: "eth_chainId" }) !== "0x7a69") throw Error("Select Anvil chain 31337. Remote chains cannot execute here.");
      const list = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      account = requiredAddress(list[0] ?? ""); await guard();
      const saved = sessionStorage.getItem(sessionKey);
      if (saved) { const pair = JSON.parse(saved) as { creator: Address; asset: Address }; router = requiredAddress(kind === "token-creator" ? pair.creator : pair.asset); }
      if (router) await verifyFixture();
      walletState.textContent = `Connected ${account.slice(0, 6)}…${account.slice(-4)} · chain 31337${router ? ` · local router ${router}` : ""}`;
      setupButton.disabled = Boolean(router);
      reconcileButton.hidden = !pending();
      set("Connected", router ? "Local payment fixture verified. Configure an operation." : "Deploy the two local test fixtures before quoting.");
    } catch (error) { account = undefined; invalidate(); set("Connection failed", String(error), true); }
  });
  window.ethereum?.on?.("accountsChanged", () => { account = undefined; invalidate(); walletState.textContent = "Wallet changed. Connect and review again."; });
  window.ethereum?.on?.("chainChanged", () => { account = undefined; invalidate(); walletState.textContent = "Network changed. Connect and review again."; });
  window.ethereum?.on?.("disconnect", () => { account = undefined; invalidate(); walletState.textContent = "Disconnected."; });
  setupButton.addEventListener("click", async () => {
    if (busy) return; busy = true; setupButton.disabled = true;
    try {
      pendingBlock(); await guard(); set("Pending local fixture deployment", "Three Anvil-only deployments require wallet confirmations. No real USDC.");
      const token = await deploy(mockAbi, paidLocalArtifacts.PitMockUSDC.bytecode as Hex, [account]);
      const prices = {
        standard: PIT_PRICES["standard-erc20-creation"].fixedMicro,
        advanced: PIT_PRICES["advanced-erc20-creation"].fixedMicro,
        multiBase: PIT_PRICES["erc20-bulk-distribution"].baseMicro,
        multiPerRecipient: PIT_PRICES["erc20-bulk-distribution"].perUnitMicro,
        multiCap: PIT_PRICES["erc20-bulk-distribution"].capMicro,
        lockFee: PIT_PRICES["token-locker"].fixedMicro,
        vestingFee: PIT_PRICES["custom-vesting"].fixedMicro,
      };
      const assetRouter = await deploy(paidAbi, paidLocalArtifacts.PitPaidOperations.bytecode as Hex, [token, merchant, account, prices]);
      const creatorRouter = await deploy(creatorAbi, paidLocalArtifacts.PitPaidTokenCreator.bytecode as Hex, [token, merchant, account, prices]);
      router = kind === "token-creator" ? creatorRouter : assetRouter;
      await verifyFixture(); sessionStorage.setItem(sessionKey, JSON.stringify({ creator: creatorRouter, asset: assetRouter }));
      walletState.textContent = `Connected ${account?.slice(0, 6)}…${account?.slice(-4)} · local router ${router}`;
      set("Local fixtures ready", `LOCAL MOCK USDC ${token}\nCreator router ${creatorRouter}\nAsset router ${assetRouter}\nMerchant fixture ${merchant}. No real recipient configured.`);
    } catch (error) { set("Fixture setup failed", String(error), true); setupButton.disabled = false; }
    finally { busy = false; }
  });
  form.addEventListener("input", invalidate);
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (busy) return; busy = true;
    try {
      pendingBlock(); prepared = await prepare(new FormData(form));
      const expected = priceForPaidOperation(kind!, prepared.recipients?.length ?? 0, prepared.advanced);
      const actual = await actualFee(prepared);
      if (actual !== expected) throw Error("Router pricing does not match the centrally reviewed local configuration.");
      const block = await publicClient.getBlock();
      quote = { operation: kind!, network: "Anvil 31337", paymentAsset: "LOCAL MOCK USDC", paymentToken: paymentToken!, payer: account!, feeRecipient: merchant,
        destination: router!, expectedSpender: router!, amountMicro: expected, maxAuthorizedServiceFeeMicro: expected, gasUnits: null, gasWei: null,
        units: prepared.recipients?.length ?? 0, assetToken: prepared.token, assetAmountRaw: prepared.total ?? prepared.amount,
        beneficiary: prepared.beneficiary, recipients: prepared.recipients?.map((r) => ({ address: r.address, amountRaw: r.amount })),
        intentId: newIntentId(), version: await read(router!, activeAbi, "priceVersion") as bigint, createdAt: block.timestamp, expiresAt: block.timestamp + 900n };
      approveButton.disabled = false; simulateButton.disabled = true; executeButton.disabled = true;
      set("Quote ready · approve exact amounts", formatLocalQuote(quote, operationSummary(prepared)));
    } catch (error) { invalidate(); set("Invalid or unavailable quote", String(error), true); }
    finally { busy = false; }
  });
  approveButton.addEventListener("click", async () => {
    if (!prepared || !quote || busy) return; busy = true; approveButton.disabled = true;
    try {
      pendingBlock(); await fresh(prepared, quote);
      await approveExact(paymentToken!, quote.amountMicro);
      if (prepared.token) await approveExact(prepared.token, prepared.total ?? prepared.amount!);
      simulateButton.disabled = false; set("Approvals confirmed", "Exact local token allowances are visible on Anvil. Simulate the atomic paid operation next.");
    } catch (error) { set("Approval failed", String(error), true); approveButton.disabled = false; }
    finally { busy = false; }
  });
  simulateButton.addEventListener("click", async () => {
    if (!prepared || !quote || busy) return; busy = true;
    try {
      pendingBlock(); await fresh(prepared, quote);
      const args = argsWithQuote(prepared, quote);
      await publicClient.simulateContract({ address: router!, abi: activeAbi, functionName: prepared.functionName, args, account: account! });
      const gas = await publicClient.estimateContractGas({ address: router!, abi: activeAbi, functionName: prepared.functionName, args, account: account! });
      const block = await publicClient.getBlock();
      if (gas >= block.gasLimit / 2n) throw Error("Estimated gas exceeds the conservative half-block budget.");
      quote = { ...quote, gasUnits: gas, gasWei: await publicClient.getGasPrice() };
      simulated = true; executeButton.disabled = false;
      set("Ready for wallet confirmation", formatLocalQuote(quote, operationSummary(prepared)));
    } catch (error) { simulated = false; executeButton.disabled = true; set("Simulation failed", String(error), true); }
    finally { busy = false; }
  });
  executeButton.addEventListener("click", async () => {
    if (!prepared || !quote || !simulated || busy) return; busy = true; executeButton.disabled = true;
    try {
      pendingBlock(); await fresh(prepared, quote); await guard();
      const args = argsWithQuote(prepared, quote);
      await publicClient.simulateContract({ address: router!, abi: activeAbi, functionName: prepared.functionName, args, account: account! });
      set("Awaiting wallet confirmation", formatLocalQuote(quote, operationSummary(prepared)));
      await guard();
      const hash = await wallet().writeContract({ address: router!, abi: activeAbi, functionName: prepared.functionName, args, account: account!, chain: foundry });
      savePending({ hash, intentId: quote.intentId, operation: kind!, payer: account!, router: router!, fee: quote.amountMicro.toString(),
        requestHash: keccak256(encodeFunctionData({ abi: activeAbi, functionName: prepared.functionName, args })), operationCode: codeFor(prepared) });
      set("Pending receipt", `Transaction ${hash}. Do not submit again; reconcile its receipt if the RPC times out.`);
      await reconcile();
    } catch (error) { set(pending() ? "Uncertain receipt · reconcile first" : "Wallet rejected or operation failed", String(error), true); }
    finally { busy = false; }
  });
  reconcileButton.addEventListener("click", async () => { try { await guard(); await verifyFixture(); await reconcile(); } catch (error) { set("Receipt not yet reconciled", String(error), true); } });
  downloadButton.addEventListener("click", () => {
    if (!receiptExport) return;
    const blob = new Blob([JSON.stringify(receiptExport, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `pit-local-paid-receipt-${receiptExport.transactionHash}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
  $<HTMLInputElement>("#paid-csv")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    if (file.size > 262_144) { set("Invalid CSV", "CSV exceeds 256 KiB.", true); return; }
    const box = form.elements.namedItem("recipients") as HTMLTextAreaElement; box.value = await file.text(); box.dispatchEvent(new Event("input", { bubbles: true }));
    set("CSV loaded locally", `Loaded ${file.size} bytes. No upload occurred.`);
  });
}
