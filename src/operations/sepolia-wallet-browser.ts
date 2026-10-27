import {
  createPublicClient, createWalletClient, custom, http, encodeDeployData, encodeFunctionData,
  decodeEventLog, keccak256, formatUnits,
  type Abi, type Address, type EIP1193Provider, type Hex,
} from "viem";
import { baseSepolia } from "viem/chains";
import { publicActionsL2 } from "viem/op-stack";
import { contracts } from "./generated/contracts";
import { scheduleRuntime } from "./generated/schedule-runtime";
import { matchesReviewedRuntime } from "./lib/reviewed-runtime";
import { positiveUnits, requiredAddress, utcSeconds, parseRecipientsCsv } from "./lib/inputs";
import type { OperationId } from "./lib/catalog";

type Deployment = { address: Address; runtimeKeccak: string };
type Config = { chainId: 84532; rpc: "https://sepolia.base.org"; signer: Address; factory: Deployment; sender: Deployment; standard: Deployment; advanced: Deployment };
type Step = { nonce: number; label: string; to: Address | null; calldataKeccak: string; gasLimit: number };
type Campaign = { chainId: 84532; signer: Address; token: Address; startNonce: number; expiresAt: number; maxFeePerGasWei: string; l1ReservePerTxWei: string; maxTotalWei: string; steps: Step[]; forms: {
  creator: { name: string; symbol: string; supply: string; recipient: Address };
  multisender: { token: Address; csv: string };
  lock: { token: Address; amount: string; beneficiary: Address; unlock: string; address: Address };
  vest: { token: Address; amount: string; beneficiary: Address; start: string; cliff: string; minutes: string; address: Address };
} };
declare const __PIT_SEPOLIA_CONFIG__: Config;
declare const __PIT4B_CAMPAIGN__: Campaign | null;
const deployment = __PIT_SEPOLIA_CONFIG__;
const campaign = __PIT4B_CAMPAIGN__;
const client = createPublicClient({ chain: baseSepolia, transport: http(deployment.rpc, { timeout: 10_000, retryCount: 0 }) });
const l2Client = client.extend(publicActionsL2());
const tokenAbi = contracts.PitStandardToken.abi as Abi;
const advancedAbi = contracts.PitAdvancedToken.abi as Abi;
const factoryAbi = contracts.PitTokenFactory.abi as Abi;
const senderAbi = contracts.PitMultiSender.abi as Abi;
const lockAbi = contracts.PitTokenLock.abi as Abi;
const vestAbi = contracts.PitTokenVesting.abi as Abi;

type Provider = EIP1193Provider & { on?: (event: string, callback: (...args: any[]) => void) => void };
type Candidate = { name: string; provider: Provider };
type Plan = { label: string; to: Address | null; data: Hex; abi?: Abi; functionName?: string; args?: readonly unknown[] };
type Prepared = {
  kind: OperationId; token?: Address; decimals?: number; amount?: bigint; beneficiary?: Address;
  unlock?: bigint; start?: bigint; duration?: bigint; cliff?: bigint;
  name?: string; symbol?: string; supply?: bigint; cap?: bigint;
  preset?: "standard" | "advanced"; minting?: boolean; burning?: boolean; pausing?: boolean;
  recipients?: { address: Address; amount: bigint }[]; total?: bigint;
};
const root = document.querySelector<HTMLElement>("#operation-root");
const kind = root?.dataset.operation as OperationId | undefined;
const tokenInput = '<label>Reviewed demonstration token<input name="token" autocomplete="off" required /></label>';
const amountInput = '<label>Amount in token units<input name="amount" inputmode="decimal" required /></label>';
const beneficiaryInput = '<label>Beneficiary address<input name="beneficiary" autocomplete="off" required /></label>';
const fields: Record<OperationId, string> = {
  "token-creator": '<div class="field-grid"><label>Preset<select name="preset"><option value="standard">Standard fixed supply</option><option value="advanced">Advanced roles and cap</option></select></label><label>Token name<input name="name" required maxlength="60" /></label><label>Symbol<input name="symbol" required maxlength="16" /></label><label>Initial supply (18 decimals)<input name="supply" inputmode="decimal" required /></label><label>Initial recipient<input name="recipient" required /></label><label>Advanced cap (18 decimals)<input name="cap" inputmode="decimal" /></label></div><label><input type="checkbox" name="minting" /> Creator may mint up to cap</label><label><input type="checkbox" name="burning" /> Holders may burn</label><label><input type="checkbox" name="pausing" /> Creator may pause</label><p class="muted">Advanced preset: connected creator is the sole initial administrator. Admin transfer takes one day. No PIT role.</p>',
  multisender: `${tokenInput}<label>Recipients (CSV: address,amount; optional header)<textarea name="recipients" required></textarea></label><label>Import local CSV<input type="file" id="recipients-file" accept=".csv,text/csv" /></label><p class="muted">1–100 distinct recipients. The exact total is the maximum requested allowance. Standard PIT test token only.</p>`,
  "token-locker": `<div class="field-grid">${tokenInput}${amountInput}${beneficiaryInput}<label>Unlock date and time (UTC)<input type="datetime-local" name="unlock" required /></label></div><p class="muted">Immutable beneficiary. Fund before unlock; no early release or PIT withdrawal.</p>`,
  "token-vesting": `<div class="field-grid">${tokenInput}${amountInput}${beneficiaryInput}<label>Start date and time (UTC)<input type="datetime-local" name="start" required /></label><label>Duration in whole minutes<input name="durationMinutes" inputmode="numeric" required /></label><label>Cliff date and time (UTC, optional)<input type="datetime-local" name="cliff" /></label></div><p class="muted">15–43,200 whole minutes. Immutable beneficiary. Fund once before start. Late direct token transfers are unsupported.</p>`,
};

if (root && kind && fields[kind]) {
  root.innerHTML = `<section class="panel"><h2>Select a browser wallet</h2><p>Only a dedicated Base Sepolia test wallet. Connection is not SIWE login or a transaction.</p><label>Provider<select id="provider"><option value="">Select a wallet</option></select></label><button type="button" id="connect">Connect wallet</button><p id="wallet-state" role="status">Wallet not connected</p></section><form id="operation-form" class="panel"><h2>Configure and review</h2>${fields[kind]}<div class="actions"><button type="submit">Validate and review</button><button type="button" id="simulate" disabled>Simulate next step</button><button type="button" id="execute" disabled>Confirm in wallet</button></div></form><section class="panel"><h2>Transaction state</h2><p id="lifecycle" role="status" aria-live="polite">Idle</p><pre id="result" aria-live="polite">No transaction has been sent.</pre>${campaign ? '<button type="button" id="download-receipts">Download public receipt list</button><p class="muted">Contains only the campaign signer and public transaction hashes. Keep the file local until you choose to share it for verification.</p>' : ""}</section>${kind === "token-locker" || kind === "token-vesting" ? '<section class="panel"><h2>Release an existing reviewed schedule</h2><label>Schedule address<input id="release-address" autocomplete="off" /></label><button id="release-simulate" type="button">Simulate release</button><button id="release-execute" type="button" disabled>Confirm release in wallet</button><p class="muted">Only the immutable beneficiary may release a positive amount after the real chain time reaches the schedule.</p></section>' : ""}`;
  boot(kind);
}

function boot(operation: OperationId) {
  const form = document.querySelector<HTMLFormElement>("#operation-form")!;
  const providerSelect = document.querySelector<HTMLSelectElement>("#provider")!;
  const walletState = document.querySelector<HTMLElement>("#wallet-state")!;
  const lifecycle = document.querySelector<HTMLElement>("#lifecycle")!;
  const result = document.querySelector<HTMLElement>("#result")!;
  const simulateButton = document.querySelector<HTMLButtonElement>("#simulate")!;
  const executeButton = document.querySelector<HTMLButtonElement>("#execute")!;
  document.querySelector<HTMLButtonElement>("#download-receipts")?.addEventListener("click", () => {
    if (!campaign || !account) { set("Receipt export unavailable", "Connect the approved campaign wallet first.", true); return; }
    try {
      const hashes = JSON.parse(sessionStorage.getItem("pit4b-receipts") ?? "[]") as unknown;
      if (!Array.isArray(hashes) || hashes.length > campaign.steps.length || !hashes.every((hash) => typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash))) throw Error("Stored public receipt list is invalid.");
      const body = JSON.stringify({ schema: "pit4b.public-receipts.v1", chainId: 84532, signer: account, token: campaign.token, hashes }, null, 2);
      const url = URL.createObjectURL(new Blob([body], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "pit4b-public-receipts.json"; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { set("Receipt export unavailable", String(error), true); }
  });
  if (campaign) {
    const fields = operation === "token-creator" ? { name: campaign.forms.creator.name, symbol: campaign.forms.creator.symbol, supply: campaign.forms.creator.supply, recipient: campaign.forms.creator.recipient }
      : operation === "multisender" ? { token: campaign.forms.multisender.token, recipients: campaign.forms.multisender.csv }
      : operation === "token-locker" ? { token: campaign.forms.lock.token, amount: campaign.forms.lock.amount, beneficiary: campaign.forms.lock.beneficiary, unlock: campaign.forms.lock.unlock }
      : { token: campaign.forms.vest.token, amount: campaign.forms.vest.amount, beneficiary: campaign.forms.vest.beneficiary, start: campaign.forms.vest.start, durationMinutes: campaign.forms.vest.minutes, cliff: campaign.forms.vest.cliff };
    for (const [name, value] of Object.entries(fields)) (form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement).value = value;
    const releaseInput = document.querySelector<HTMLInputElement>("#release-address");
    if (releaseInput) releaseInput.value = operation === "token-locker" ? campaign.forms.lock.address : campaign.forms.vest.address;
  }
  const candidates: Candidate[] = [];
  let provider: Provider | undefined, account: Address | undefined, prepared: Prepared | undefined;
  let currentPlan: Plan | undefined, releasePlan: Plan | undefined, created: Address | undefined;
  let busy = false, generation = 0;
  const value = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
  const set = (state: string, detail: string, error = false) => { lifecycle.textContent = state; result.textContent = detail; result.className = error ? "danger" : ""; };
  const clear = () => { generation++; prepared = undefined; currentPlan = undefined; releasePlan = undefined; simulateButton.disabled = true; executeButton.disabled = true; document.querySelector<HTMLButtonElement>("#release-execute")?.setAttribute("disabled", ""); };
  function addCandidate(name: string, candidate: Provider) {
    if (!candidate || typeof candidate.request !== "function" || candidates.some((item) => item.provider === candidate) || candidates.length >= 8) return;
    candidates.push({ name: name.slice(0, 60), provider: candidate });
    const option = document.createElement("option"); option.value = String(candidates.length - 1); option.textContent = name.slice(0, 60); providerSelect.append(option);
  }
  window.addEventListener("eip6963:announceProvider", (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (detail?.provider?.request && typeof detail?.info?.name === "string") addCandidate(detail.info.name, detail.provider);
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  window.setTimeout(() => {
    const injected = (window as Window & { ethereum?: Provider & { providers?: Provider[] } }).ethereum;
    if (injected?.providers?.length) injected.providers.forEach((item: Provider, index: number) => addCandidate(`Injected wallet ${index + 1}`, item));
    else if (injected) addCandidate("Injected wallet", injected);
  }, 500);
  const onChange = () => { clear(); account = undefined; walletState.textContent = "Wallet or chain changed. Reconnect and review again."; set("Connection changed", "All prepared transaction data was discarded.", true); };
  async function assertChainAndAccount() {
    if (!provider || !account) throw Error("Connect a wallet first.");
    if (!["127.0.0.1", "localhost"].includes(location.hostname)) throw Error("Wallet execution is restricted to a local preview.");
    if (await provider.request({ method: "eth_chainId" }) !== "0x14a34" || await client.getChainId() !== 84532) throw Error("Wrong network: Base Sepolia chain 84532 is required. No automatic chain switch.");
    const active = await provider.request({ method: "eth_accounts" }) as string[];
    if (active.length !== 1 || active[0].toLowerCase() !== account.toLowerCase()) { onChange(); throw Error("Wallet account changed; reconnect and review."); }
    if (campaign && account.toLowerCase() !== campaign.signer.toLowerCase()) throw Error("Connected wallet differs from the approved campaign signer.");
  }
  async function codeMatches(item: Deployment) {
    const code = await client.getCode({ address: item.address });
    if (!code || keccak256(code).slice(2).toLowerCase() !== item.runtimeKeccak.toLowerCase()) throw Error(`Reviewed contract code mismatch: ${item.address}`);
  }
  async function tokenBalance(token: Address, owner: Address) { return await client.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [owner] }) as bigint; }
  async function reviewedToken(token: Address) {
    const expected = campaign?.token ?? deployment.standard.address;
    if (token.toLowerCase() !== expected.toLowerCase()) throw Error("Only the reviewed demonstration token is supported in this campaign.");
    if (campaign) {
      const code = await client.getCode({ address: expected });
      const reference = await client.getCode({ address: deployment.standard.address });
      if (!code || !reference || keccak256(code) !== keccak256(reference)) throw Error("Campaign-created token code differs from the reviewed standard token.");
    } else await codeMatches(deployment.standard);
    const decimals = Number(await client.readContract({ address: token, abi: tokenAbi, functionName: "decimals" }));
    if (decimals !== 18) throw Error("Unexpected token decimals.");
    return decimals;
  }
  async function prepare(data: FormData): Promise<Prepared> {
    await assertChainAndAccount();
    if (operation === "token-creator") {
      const preset = value(data, "preset") === "advanced" ? "advanced" : "standard";
      if (campaign && preset !== "standard") throw Error("The approved campaign creates one fixed-supply standard token only.");
      const name = value(data, "name"), symbol = value(data, "symbol");
      if (!name || !symbol || name.length > 60 || symbol.length > 16 || /[\u0000-\u001f]/.test(name + symbol)) throw Error("Name and symbol must be short printable text.");
      const supply = positiveUnits(value(data, "supply"), 18), cap = preset === "advanced" ? positiveUnits(value(data, "cap"), 18) : supply;
      if (cap < supply) throw Error("Cap is smaller than the initial supply.");
      return { kind: operation, preset, name, symbol, supply, cap, beneficiary: requiredAddress(value(data, "recipient")), minting: data.has("minting"), burning: data.has("burning"), pausing: data.has("pausing") };
    }
    const token = requiredAddress(value(data, "token"));
    const decimals = await reviewedToken(token);
    if (operation === "multisender") {
      const batch = parseRecipientsCsv(value(data, "recipients"), decimals, account);
      if (await tokenBalance(token, account!) < batch.total) throw Error("Insufficient token balance for distribution.");
      return { kind: operation, token, decimals, recipients: batch.recipients, total: batch.total };
    }
    const amount = positiveUnits(value(data, "amount"), decimals), beneficiary = requiredAddress(value(data, "beneficiary"));
    if (await tokenBalance(token, account!) < amount) throw Error("Insufficient token balance for funding.");
    const now = (await client.getBlock()).timestamp;
    if (operation === "token-locker") {
      const unlock = utcSeconds(value(data, "unlock"));
      if (unlock <= now + 300n) throw Error("Unlock must be more than five minutes after the current chain time.");
      return { kind: operation, token, decimals, amount, beneficiary, unlock };
    }
    const start = utcSeconds(value(data, "start")), minutes = value(data, "durationMinutes");
    if (!/^[1-9]\d{0,4}$/.test(minutes) || Number(minutes) < 15 || Number(minutes) > 43200) throw Error("Duration must be 15–43,200 whole minutes.");
    const duration = BigInt(minutes) * 60n;
    const cliff = value(data, "cliff") ? utcSeconds(value(data, "cliff")) : start;
    if (start <= now + 300n || cliff < start || cliff > start + duration) throw Error("Start must be future and cliff within the schedule.");
    return { kind: operation, token, decimals, amount, beneficiary, start, duration, cliff };
  }
  function describe(p: Prepared) {
    if (p.kind === "token-creator") return `${p.preset} token ${p.name} (${p.symbol})\nInitial ${formatUnits(p.supply!, 18)}; cap ${formatUnits(p.cap!, 18)}; recipient ${p.beneficiary}; creator/admin ${account}\nMint ${p.minting}; burn ${p.burning}; pause ${p.pausing}. Advanced admin transfer has a one-day delay. PIT has no role.`;
    if (p.kind === "multisender") return `${p.recipients!.length} recipients; ${formatUnits(p.total!, 18)} tokens from ${account}; spender ${deployment.sender.address}\n${p.recipients!.map((r) => `${r.address}: ${formatUnits(r.amount, 18)}`).join("\n")}`;
    if (p.kind === "token-locker") return `Lock ${formatUnits(p.amount!, 18)} tokens for immutable beneficiary ${p.beneficiary} until ${new Date(Number(p.unlock!) * 1000).toISOString()}.`;
    return `Vest ${formatUnits(p.amount!, 18)} tokens for immutable beneficiary ${p.beneficiary}; start ${new Date(Number(p.start!) * 1000).toISOString()}, cliff ${new Date(Number(p.cliff!) * 1000).toISOString()}, duration ${p.duration! / 60n} minutes.`;
  }
  async function nextPlan(p: Prepared): Promise<Plan> {
    await assertChainAndAccount();
    if (p.kind === "token-creator") {
      await codeMatches(deployment.factory);
      const advanced = p.preset === "advanced";
      const functionName = advanced ? "createAdvanced" : "createStandard";
      const args = advanced ? [p.name, p.symbol, p.supply, p.cap, p.beneficiary, p.minting, p.burning, p.pausing] : [p.name, p.symbol, p.supply, p.beneficiary];
      return { label: functionName, to: deployment.factory.address, data: encodeFunctionData({ abi: factoryAbi, functionName, args }), abi: factoryAbi, functionName, args };
    }
    const token = p.token!;
    await reviewedToken(token);
    if (p.kind === "multisender") await codeMatches(deployment.sender);
    if ((p.kind === "token-locker" || p.kind === "token-vesting") && !created) {
      const lock = p.kind === "token-locker";
      const abi = lock ? lockAbi : vestAbi;
      const bytecode = lock ? contracts.PitTokenLock.bytecode : contracts.PitTokenVesting.bytecode;
      const args = lock ? [token, p.beneficiary, p.unlock] : [token, p.beneficiary, p.start, p.duration, p.cliff, p.amount];
      return { label: lock ? "deploy-lock" : "deploy-vesting", to: null, data: encodeDeployData({ abi, bytecode, args }) };
    }
    const spender = p.kind === "multisender" ? deployment.sender.address : created!;
    const required = p.kind === "multisender" ? p.total! : p.amount!;
    const allowance = await client.readContract({ address: token, abi: tokenAbi, functionName: "allowance", args: [account!, spender] }) as bigint;
    if (allowance < required) return { label: "exact-approval", to: token, data: encodeFunctionData({ abi: tokenAbi, functionName: "approve", args: [spender, required] }), abi: tokenAbi, functionName: "approve", args: [spender, required] };
    if (p.kind === "multisender") {
      const args = [token, p.recipients!.map((r) => r.address), p.recipients!.map((r) => r.amount)];
      return { label: "send-batch", to: deployment.sender.address, data: encodeFunctionData({ abi: senderAbi, functionName: "send", args }), abi: senderAbi, functionName: "send", args };
    }
    const abi = p.kind === "token-locker" ? lockAbi : vestAbi;
    const args = p.kind === "token-locker" ? [p.amount!] : [];
    return { label: "fund-schedule", to: created!, data: encodeFunctionData({ abi, functionName: "fund", args }), abi, functionName: "fund", args };
  }
  async function verifyPastSteps() {
    if (!campaign || !account) throw Error("No approved Base Sepolia campaign is loaded. Writes are disabled.");
    const current = await client.getTransactionCount({ address: account, blockTag: "pending" });
    if (current < campaign.startNonce || current > campaign.startNonce + campaign.steps.length) throw Error("Wallet nonce outside approved campaign.");
    const history = JSON.parse(sessionStorage.getItem("pit4b-receipts") ?? "[]") as string[];
    if (!Array.isArray(history) || history.length !== current - campaign.startNonce) throw Error("Campaign receipt history is incomplete; stop and reconcile before continuing.");
    for (const [index, hash] of history.entries()) {
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw Error("Malformed campaign receipt history.");
      const [tx, receipt] = await Promise.all([client.getTransaction({ hash: hash as Hex }), client.getTransactionReceipt({ hash: hash as Hex })]);
      const step = campaign.steps[index];
      if (receipt.status !== "success" || tx.nonce !== step.nonce || tx.from.toLowerCase() !== account.toLowerCase() ||
          (tx.to?.toLowerCase() ?? null) !== (step.to?.toLowerCase() ?? null) || keccak256(tx.input).slice(2).toLowerCase() !== step.calldataKeccak.toLowerCase()) throw Error("Prior campaign transaction differs from the approved plan.");
    }
    return current;
  }
  async function simulate(plan: Plan) {
    await assertChainAndAccount();
    if (plan.to === null) await client.call({ account: account!, data: plan.data });
    else await client.call({ account: account!, to: plan.to, data: plan.data });
    const gas = await client.estimateGas({ account: account!, to: plan.to ?? undefined, data: plan.data });
    if (gas >= (await client.getBlock()).gasLimit / 2n) throw Error("Gas exceeds the conservative half-block bound.");
    return gas;
  }
  async function guardedWrite(plan: Plan) {
    await assertChainAndAccount();
    if (!campaign || (await client.getBlock()).timestamp > BigInt(campaign.expiresAt)) throw Error("Campaign authorization is absent or expired.");
    const nonce = await verifyPastSteps();
    const step = campaign!.steps[nonce - campaign!.startNonce];
    if (!step || step.label !== plan.label || (step.to?.toLowerCase() ?? null) !== (plan.to?.toLowerCase() ?? null) ||
        step.calldataKeccak.toLowerCase() !== keccak256(plan.data).slice(2).toLowerCase()) throw Error("This transaction is not an approved exact campaign step.");
    if (plan.to === deployment.factory.address) await codeMatches(deployment.factory);
    else if (plan.to === deployment.sender.address) await codeMatches(deployment.sender);
    else if (plan.to?.toLowerCase() === campaign!.token.toLowerCase()) await reviewedToken(campaign!.token);
    else if (plan.label === "fund-schedule" || plan.label === "release-schedule") {
      const vesting = nonce - campaign!.startNonce >= 9;
      const abi = vesting ? vestAbi : lockAbi;
      const reviewed = vesting ? scheduleRuntime.PitTokenVesting : scheduleRuntime.PitTokenLock;
      if (!plan.to || !matchesReviewedRuntime(await client.getCode({ address: plan.to }), reviewed)) throw Error("Schedule code changed before the wallet write.");
      const [beneficiary, token] = await Promise.all([
        client.readContract({ address: plan.to, abi, functionName: "beneficiary" }) as Promise<Address>,
        client.readContract({ address: plan.to, abi, functionName: "token" }) as Promise<Address>,
      ]);
      if (beneficiary.toLowerCase() !== account!.toLowerCase() || token.toLowerCase() !== campaign!.token.toLowerCase()) throw Error("Schedule beneficiary or token changed before the wallet write.");
    }
    const estimate = await simulate(plan);
    if (estimate > BigInt(step.gasLimit)) throw Error("Current gas estimate exceeds the approved transaction cap.");
    const fees = await client.estimateFeesPerGas();
    const maxFee = BigInt(campaign!.maxFeePerGasWei);
    if (fees.maxFeePerGas === undefined || fees.maxPriorityFeePerGas === undefined || fees.maxFeePerGas > maxFee || fees.maxPriorityFeePerGas > maxFee) throw Error("Current gas price exceeds the approved cap.");
    const l1Estimate = await l2Client.estimateL1Fee({ account: account!, to: plan.to ?? undefined, data: plan.data, gas: BigInt(step.gasLimit), maxFeePerGas: maxFee, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, nonce });
    if (l1Estimate > BigInt(campaign!.l1ReservePerTxWei)) throw Error("Current L1 data fee estimate exceeds the approved reserve.");
    const balance = await client.getBalance({ address: account! });
    if (balance < BigInt(step.gasLimit) * maxFee + BigInt(campaign!.l1ReservePerTxWei)) throw Error("Insufficient test ETH for the capped network fee.");
    await assertChainAndAccount();
    if (await client.getTransactionCount({ address: account!, blockTag: "pending" }) !== nonce) throw Error("Wallet nonce changed before confirmation.");
    const wallet = createWalletClient({ account: account!, chain: baseSepolia, transport: custom(provider!) });
    const hash = await wallet.sendTransaction({ account: account!, chain: baseSepolia, to: plan.to ?? undefined, data: plan.data, gas: BigInt(step.gasLimit), maxFeePerGas: maxFee, maxPriorityFeePerGas: fees.maxPriorityFeePerGas, nonce });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 120_000 });
    if (receipt.status !== "success") throw Error(`Transaction reverted: ${hash}; inspect on-chain state before retrying.`);
    const tx = await client.getTransaction({ hash });
    if (tx.nonce !== nonce || tx.from.toLowerCase() !== account!.toLowerCase() || (tx.to?.toLowerCase() ?? null) !== (plan.to?.toLowerCase() ?? null) || keccak256(tx.input) !== keccak256(plan.data)) throw Error("Confirmed transaction differs from the approved request.");
    const history = JSON.parse(sessionStorage.getItem("pit4b-receipts") ?? "[]") as string[];
    history.push(hash); sessionStorage.setItem("pit4b-receipts", JSON.stringify(history));
    return receipt;
  }
  document.querySelector<HTMLButtonElement>("#connect")!.addEventListener("click", async () => {
    try {
      const selected = candidates[Number(providerSelect.value)];
      if (!selected || providerSelect.value === "") throw Error("Select a wallet provider explicitly.");
      clear(); provider = selected.provider;
      const list = await provider.request({ method: "eth_requestAccounts" }) as string[];
      if (list.length !== 1) throw Error("Select exactly one account in the wallet.");
      account = requiredAddress(list[0]);
      provider.on?.("accountsChanged", onChange); provider.on?.("chainChanged", onChange); provider.on?.("disconnect", onChange);
      await assertChainAndAccount();
      walletState.textContent = `${selected.name}: ${account.slice(0, 6)}…${account.slice(-4)} · Base Sepolia 84532`;
      set("Connected", campaign ? "Approved campaign loaded. Configure the operation." : "Read and simulation only. No campaign approval is loaded; signing is disabled.");
    } catch (error) { clear(); account = undefined; set("Connection failed", String(error), true); }
  });
  providerSelect.addEventListener("change", onChange);
  form.addEventListener("input", clear);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { clear(); prepared = await prepare(new FormData(form)); simulateButton.disabled = false; set("Ready to simulate", `${describe(prepared)}\nFactory ${deployment.factory.address}; MultiSender ${deployment.sender.address}. PIT fee inactive.`); }
    catch (error) { clear(); set("Invalid input", String(error), true); }
  });
  simulateButton.addEventListener("click", async () => {
    if (!prepared || busy) return;
    const serial = generation;
    try { busy = true; currentPlan = await nextPlan(prepared); const gas = await simulate(currentPlan); if (serial !== generation) throw Error("Form or wallet changed during simulation."); executeButton.disabled = !campaign; set(campaign ? "Ready for wallet confirmation" : "Simulation only · no authorization", `${describe(prepared)}\nNext: ${currentPlan.label}; destination ${currentPlan.to ?? "new contract"}; estimated ${gas} gas. Wallet will display the transaction. PIT fee inactive.`); }
    catch (error) { currentPlan = undefined; executeButton.disabled = true; set("Simulation failed", String(error), true); }
    finally { busy = false; }
  });
  executeButton.addEventListener("click", async () => {
    if (!currentPlan || !prepared || busy || !campaign) return;
    busy = true; executeButton.disabled = true; simulateButton.disabled = true;
    const plan = currentPlan, p = prepared;
    try {
      set("Awaiting wallet confirmation", `Review ${plan.label} and destination ${plan.to ?? "contract creation"} in your wallet. Do not approve any different action.`);
      const before = p.kind === "multisender" && plan.label === "send-batch" ? await Promise.all(p.recipients!.map((r) => tokenBalance(p.token!, r.address))) : undefined;
      const senderBefore = before ? await tokenBalance(p.token!, account!) : undefined;
      const receipt = await guardedWrite(plan);
      let readback = `Receipt ${receipt.transactionHash}; block ${receipt.blockNumber}; gas used ${receipt.gasUsed}.`;
      if (plan.label === "deploy-lock" || plan.label === "deploy-vesting") {
        if (!receipt.contractAddress) throw Error("Deployment receipt has no contract address.");
        const reviewed = plan.label === "deploy-lock" ? scheduleRuntime.PitTokenLock : scheduleRuntime.PitTokenVesting;
        if (!matchesReviewedRuntime(await client.getCode({ address: receipt.contractAddress }), reviewed)) throw Error("New schedule runtime does not match reviewed Solidity code.");
        created = receipt.contractAddress;
        const expectedAddress = campaign.steps[plan.label === "deploy-lock" ? 5 : 9].to;
        if (!expectedAddress || created.toLowerCase() !== expectedAddress.toLowerCase()) throw Error("New schedule address differs from the approved campaign.");
        readback += ` New schedule ${created}. Verify this address before approving funding.`;
        const releaseInput = document.querySelector<HTMLInputElement>("#release-address"); if (releaseInput) releaseInput.value = created;
      } else if (plan.label === "createStandard" || plan.label === "createAdvanced") {
        const event = receipt.logs.map((log) => { try { return decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics }); } catch { return undefined; } }).find((entry) => entry?.eventName === "TokenCreated");
        const token = (event?.args as { token?: Address; creator?: Address } | undefined)?.token;
        if (!token || (event?.args as { creator?: Address }).creator?.toLowerCase() !== account!.toLowerCase()) throw Error("TokenCreated receipt is missing or has the wrong creator.");
        if (campaign && token.toLowerCase() !== campaign.token.toLowerCase()) throw Error("Created token address differs from the approved campaign.");
        const code = await client.getCode({ address: token });
        if (!code || (p.preset === "standard" && keccak256(code) !== keccak256((await client.getCode({ address: deployment.standard.address }))!)) ||
            (p.preset === "advanced" && !matchesReviewedRuntime(code, scheduleRuntime.PitAdvancedToken))) throw Error("Created token runtime differs from reviewed implementation.");
        const supply = await client.readContract({ address: token, abi: tokenAbi, functionName: "totalSupply" }) as bigint;
        const recipientBalance = await tokenBalance(token, p.beneficiary!);
        if (supply !== p.supply || recipientBalance !== p.supply) throw Error("Created token supply or recipient balance mismatch.");
        if (p.preset === "advanced") {
          const [admin, cap, delay, mintEnabled, burnEnabled, pauseEnabled] = await Promise.all([
            client.readContract({ address: token, abi: advancedAbi, functionName: "defaultAdmin" }) as Promise<Address>,
            client.readContract({ address: token, abi: advancedAbi, functionName: "cap" }) as Promise<bigint>,
            client.readContract({ address: token, abi: advancedAbi, functionName: "defaultAdminDelay" }) as Promise<number>,
            client.readContract({ address: token, abi: advancedAbi, functionName: "mintingEnabled" }) as Promise<boolean>,
            client.readContract({ address: token, abi: advancedAbi, functionName: "burningEnabled" }) as Promise<boolean>,
            client.readContract({ address: token, abi: advancedAbi, functionName: "pausingEnabled" }) as Promise<boolean>,
          ]);
          if (admin.toLowerCase() !== account!.toLowerCase() || cap !== p.cap || Number(delay) !== 86400 || mintEnabled !== p.minting || burnEnabled !== p.burning || pauseEnabled !== p.pausing) throw Error("Advanced token privileges or cap mismatch.");
        }
        readback += ` Created token ${token}; supply and recipient balance ${supply}; creator ${account}.`;
      } else if (plan.label === "send-batch") {
        const after = await Promise.all(p.recipients!.map((r) => tokenBalance(p.token!, r.address)));
        const senderAfter = await tokenBalance(p.token!, account!);
        if (after.some((balance, index) => balance - before![index] !== p.recipients![index].amount) || senderBefore! - senderAfter !== p.total) throw Error("Distribution balance conservation mismatch.");
        readback += ` Exact batch of ${p.total} raw units confirmed across ${after.length} recipients; sender debit matches.`;
      } else if (plan.label === "fund-schedule") {
        const abi = p.kind === "token-locker" ? lockAbi : vestAbi;
        const [beneficiary, token, balance] = await Promise.all([
          client.readContract({ address: created!, abi, functionName: "beneficiary" }) as Promise<Address>,
          client.readContract({ address: created!, abi, functionName: "token" }) as Promise<Address>,
          tokenBalance(p.token!, created!),
        ]);
        if (beneficiary.toLowerCase() !== p.beneficiary!.toLowerCase() || token.toLowerCase() !== p.token!.toLowerCase() || balance !== p.amount) throw Error("Schedule funding or immutable configuration mismatch.");
        readback += ` Schedule ${created} holds exactly ${balance} raw units for immutable beneficiary ${beneficiary}.`;
      }
      currentPlan = undefined;
      set("Receipt confirmed · state checked", `${readback}\n${plan.label === "exact-approval" || plan.label.startsWith("deploy-") ? "Simulate the next step before another wallet confirmation." : "Operation step complete."}`);
      if (plan.label === "exact-approval" || plan.label.startsWith("deploy-")) simulateButton.disabled = false;
    } catch (error) { set("Failed or uncertain · inspect chain before retry", String(error), true); }
    finally { busy = false; }
  });
  document.querySelector<HTMLInputElement>("#recipients-file")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    if (file.size > 262_144) { set("Invalid CSV", "CSV exceeds 256 KiB.", true); return; }
    const text = await file.text(); const field = form.elements.namedItem("recipients") as HTMLTextAreaElement;
    field.value = text; field.dispatchEvent(new Event("input", { bubbles: true }));
    set("CSV loaded locally", `${file.size} bytes. Validate before simulation; the file was not uploaded.`);
  });
  const releaseSimulate = document.querySelector<HTMLButtonElement>("#release-simulate");
  releaseSimulate?.addEventListener("click", async () => {
    try {
      await assertChainAndAccount();
      const address = requiredAddress(document.querySelector<HTMLInputElement>("#release-address")!.value.trim());
      const abi = operation === "token-locker" ? lockAbi : vestAbi;
      const reviewed = operation === "token-locker" ? scheduleRuntime.PitTokenLock : scheduleRuntime.PitTokenVesting;
      if (!matchesReviewedRuntime(await client.getCode({ address }), reviewed)) throw Error("Schedule runtime is not the reviewed contract.");
      const beneficiary = await client.readContract({ address, abi, functionName: "beneficiary" }) as Address;
      const token = await client.readContract({ address, abi, functionName: "token" }) as Address;
      if (beneficiary.toLowerCase() !== account!.toLowerCase() || token.toLowerCase() !== (campaign?.token ?? deployment.standard.address).toLowerCase()) throw Error("Wrong beneficiary or token.");
      const amount = operation === "token-locker"
        ? (await client.readContract({ address, abi, functionName: "deposited" }) as bigint) - (await client.readContract({ address, abi, functionName: "released" }) as bigint)
        : await client.readContract({ address, abi, functionName: "releasable" }) as bigint;
      if (amount <= 0n) throw Error("Nothing is currently releasable on the real chain.");
      releasePlan = { label: "release-schedule", to: address, data: encodeFunctionData({ abi, functionName: "release" }), abi, functionName: "release" };
      const gas = await simulate(releasePlan);
      document.querySelector<HTMLButtonElement>("#release-execute")!.disabled = !campaign;
      set(campaign ? "Release ready for wallet confirmation" : "Release simulation only", `Beneficiary ${beneficiary}; token ${token}; currently releasable ${amount} raw units; estimated ${gas} gas.`);
    } catch (error) { releasePlan = undefined; document.querySelector<HTMLButtonElement>("#release-execute")!.disabled = true; set("Release unavailable", String(error), true); }
  });
  document.querySelector<HTMLButtonElement>("#release-execute")?.addEventListener("click", async () => {
    if (!releasePlan || busy || !campaign) return;
    busy = true; const button = document.querySelector<HTMLButtonElement>("#release-execute")!; button.disabled = true;
    try {
      const address = releasePlan.to!, abi = releasePlan.abi!;
      const token = await client.readContract({ address, abi, functionName: "token" }) as Address;
      const before = await tokenBalance(token, account!);
      const receipt = await guardedWrite(releasePlan);
      const after = await tokenBalance(token, account!);
      if (after <= before) throw Error("Release receipt succeeded but beneficiary balance did not increase.");
      set("Release confirmed · state checked", `Receipt ${receipt.transactionHash}; block ${receipt.blockNumber}; beneficiary received ${after - before} raw token units.`);
      releasePlan = undefined;
    } catch (error) { set("Release failed or uncertain", String(error), true); }
    finally { busy = false; }
  });
}
