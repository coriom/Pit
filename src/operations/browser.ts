import {
  createPublicClient, createWalletClient, custom, http, encodeDeployData,
  decodeEventLog, formatUnits, type Abi, type Address, type Hex,
} from "viem";
import { foundry } from "viem/chains";
import { contracts } from "./generated/contracts";
import { positiveUnits, requiredAddress, utcSeconds, parseRecipientsCsv } from "./lib/inputs";
import type { OperationId } from "./lib/catalog";

const RPC = "http://127.0.0.1:8545";
const publicClient = createPublicClient({ chain: foundry, transport: http(RPC, { timeout: 10_000 }) });
const root = document.querySelector<HTMLElement>("#operation-root");
const operation = root?.dataset.operation as OperationId | undefined;
const erc20Abi = contracts.PitStandardToken.abi as Abi;
const factoryAbi = contracts.PitTokenFactory.abi as Abi;
const senderAbi = contracts.PitMultiSender.abi as Abi;
const lockAbi = contracts.PitTokenLock.abi as Abi;
const vestAbi = contracts.PitTokenVesting.abi as Abi;

const commonToken = `<label>Token contract address<input name="token" autocomplete="off" required placeholder="0x…" /></label>`;
const commonAmount = `<label>Amount in token units<input name="amount" inputmode="decimal" required placeholder="100.0" /></label>`;
const commonBeneficiary = `<label>Beneficiary address<input name="beneficiary" autocomplete="off" required placeholder="0x…" /></label>`;
const fields: Record<OperationId, string> = {
  "token-creator": `<div class="field-grid"><label>Preset<select name="preset"><option value="standard">Standard fixed supply</option><option value="advanced">Advanced roles and cap</option></select></label><label>Token name<input name="name" required maxlength="60" placeholder="Example Token" /></label><label>Symbol<input name="symbol" required maxlength="16" placeholder="EXM" /></label><label>Initial supply (18 decimals)<input name="supply" inputmode="decimal" required placeholder="1000000" /></label><label>Initial recipient<input name="recipient" required placeholder="0x…" /></label><label>Advanced cap (18 decimals)<input name="cap" inputmode="decimal" placeholder="2000000" /></label></div><div id="advanced-fields"><label><input type="checkbox" name="minting"/> Creator may mint up to cap</label><label><input type="checkbox" name="burning"/> Holders may burn</label><label><input type="checkbox" name="pausing"/> Creator may pause all transfers</label></div><p class="muted">Advanced administrator and enabled roles go only to the connected creator. No PIT role, transfer tax, blacklist or upgradeability.</p>`,
  multisender: `${commonToken}<label>Recipients (CSV: address,amount; optional header)<textarea name="recipients" required placeholder="address,amount&#10;0x…,10"></textarea></label><label>Import a local CSV (maximum 256 KiB)<input type="file" id="recipients-file" accept=".csv,text/csv" /></label><p class="muted">1–100 distinct recipients; exact amounts. Standard ERC-20 behavior required. Approval is at most the batch total.</p>`,
  "token-locker": `<div class="field-grid">${commonToken}${commonAmount}${commonBeneficiary}<label>Unlock date and time (UTC)<input type="datetime-local" name="unlock" required /></label></div><p class="muted">Beneficiary is immutable. Funding is allowed only before unlock; direct transfers to the contract are unsupported.</p>`,
  "token-vesting": `<div class="field-grid">${commonToken}${commonAmount}${commonBeneficiary}<label>Start date and time (UTC)<input type="datetime-local" name="start" required /></label><label>Duration in whole days<input name="durationDays" inputmode="numeric" required placeholder="365" /></label><label>Cliff date and time (UTC; blank means start)<input type="datetime-local" name="cliff" /></label></div><p class="muted">Fund once before start. Beneficiary and schedule are immutable. No late top-ups, revocation or ownership transfer. Integer vesting rounds down until completion.</p>`,
};
if (root && operation && fields[operation]) {
  root.innerHTML = `<section class="panel"><h2>Connect a local wallet</h2><p>Only an injected wallet on Anvil chain 31337 can execute. Connecting an address alone is not a transaction.</p><button id="connect" type="button">Connect local wallet</button><p id="wallet-state" role="status">Awaiting connection</p></section><form id="operation-form" class="panel"><h2>Configure the operation</h2>${fields[operation]}<div class="actions"><button id="validate" type="submit">Validate and review</button><button id="simulate" type="button" disabled>Simulate on Anvil</button><button id="execute" type="button" disabled>Execute locally</button></div></form><section class="panel"><h2>Review and result</h2><p id="lifecycle" role="status" aria-live="polite">Idle</p><output id="result" aria-live="polite">Enter inputs, then validate.</output></section>${operation === "token-locker" || operation === "token-vesting" ? `<section class="panel"><h2>Release an existing local schedule</h2><label>Deployed schedule address<input id="release-address" placeholder="0x…" /></label><button id="release" type="button">Simulate and release locally</button><p class="muted">Only the immutable beneficiary may release. A local receipt and state readback confirm success.</p></section>` : ""}`;
  boot(operation);
}

type Prepared = {
  kind: OperationId; token?: Address; amount?: bigint; beneficiary?: Address; unlock?: bigint;
  start?: bigint; duration?: bigint; cliff?: bigint; name?: string; symbol?: string; supply?: bigint;
  cap?: bigint; preset?: "standard" | "advanced"; minting?: boolean; burning?: boolean; pausing?: boolean;
  recipients?: { address: Address; amount: bigint }[]; total?: bigint; decimals?: number;
};

function boot(kind: OperationId) {
  const form = document.querySelector<HTMLFormElement>("#operation-form")!;
  const lifecycle = document.querySelector<HTMLElement>("#lifecycle")!;
  const output = document.querySelector<HTMLOutputElement>("#result")!;
  const walletState = document.querySelector<HTMLElement>("#wallet-state")!;
  const simulateButton = document.querySelector<HTMLButtonElement>("#simulate")!;
  const executeButton = document.querySelector<HTMLButtonElement>("#execute")!;
  const connectButton = document.querySelector<HTMLButtonElement>("#connect")!;
  let account: Address | undefined;
  let prepared: Prepared | undefined;
  let simulated = false;
  let busy = false;
  const set = (state: string, detail: string, error = false) => {
    lifecycle.textContent = state;
    output.textContent = detail;
    output.className = error ? "danger" : "";
  };
  const value = (data: FormData, name: string) => String(data.get(name) ?? "").trim();
  async function assertLocalChain() {
    if (!window.ethereum) throw Error("Install or enable an injected wallet connected to local Anvil.");
    const walletChain = await window.ethereum.request({ method: "eth_chainId" });
    if (walletChain !== "0x7a69") throw Error("Wrong network. Select local Anvil chain 31337. No remote execution is permitted.");
    const rpcChain = await publicClient.getChainId();
    if (rpcChain !== 31337) throw Error("Local RPC is not Anvil chain 31337.");
    if (account) {
      const connectedAccount = account;
      const active = await window.ethereum.request({ method: "eth_accounts" }) as string[];
      if (!active.some((address) => address.toLowerCase() === connectedAccount.toLowerCase())) {
        prepared = undefined; simulated = false;
        simulateButton.disabled = true; executeButton.disabled = true;
        throw Error("Wallet account changed. Connect and review the operation again.");
      }
    }
  }
  function wallet() {
    if (!account || !window.ethereum) throw Error("Connect a local wallet first.");
    return createWalletClient({ account, chain: foundry, transport: custom(window.ethereum) });
  }
  async function receipt(hash: Hex) {
    const result = await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    if (result.status !== "success") throw Error(`Local transaction reverted: ${hash}`);
    return result;
  }
  async function deploy(abi: Abi, bytecode: Hex, args: readonly unknown[] = []) {
    await assertLocalChain();
    const hash = await wallet().deployContract({ abi, bytecode, args, chain: foundry, account: account! });
    const result = await receipt(hash);
    if (!result.contractAddress) throw Error("Deployment receipt did not contain a contract address.");
    return { address: result.contractAddress, hash, gas: result.gasUsed };
  }
  async function call(address: Address, abi: Abi, functionName: string, args: readonly unknown[]) {
    await assertLocalChain();
    await publicClient.simulateContract({ address, abi, functionName, args, account: account! });
    const gasEstimate = await publicClient.estimateContractGas({ address, abi, functionName, args, account: account! });
    const blockLimit = (await publicClient.getBlock()).gasLimit;
    if (gasEstimate >= blockLimit / 2n) throw Error("Local transaction exceeds the conservative half-block gas budget.");
    await assertLocalChain();
    lifecycle.textContent = `Pending · ${functionName} local estimate ${gasEstimate} gas`;
    const hash = await wallet().writeContract({ address, abi, functionName, args, chain: foundry, account: account! });
    const result = await receipt(hash);
    return { hash, gas: result.gasUsed, gasEstimate, logs: result.logs };
  }
  async function decimals(token: Address) {
    const d = Number(await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "decimals" }));
    if (!Number.isInteger(d) || d < 0 || d > 36) throw Error("Unsupported token decimal precision.");
    return d;
  }
  async function balance(token: Address, owner: Address) {
    return BigInt(await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) as bigint);
  }
  async function approval(token: Address, spender: Address, amount: bigint) {
    const existing = BigInt(await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account!, spender] }) as bigint);
    if (existing >= amount) return `Existing allowance ${existing} raw units for spender ${spender} covers the required ${amount} raw units; no new approval sent.`;
    set("Awaiting exact local approval", `Token ${token}\nSpender ${spender}\nRequired ${amount} raw units; current allowance ${existing}. The wallet will be asked for no more than the required amount. Reject if any field differs.`);
    const result = await call(token, erc20Abi, "approve", [spender, amount]);
    return `Exact required allowance set in local transaction ${result.hash}; gas ${result.gas}.`;
  }
  async function prepare(data: FormData): Promise<Prepared> {
    await assertLocalChain();
    if (!account) throw Error("Connect a local wallet first.");
    if (kind === "token-creator") {
      const preset = value(data, "preset") === "advanced" ? "advanced" : "standard";
      const name = value(data, "name"), symbol = value(data, "symbol");
      if (!name || !symbol || name.length > 60 || symbol.length > 16 || /[\u0000-\u001f]/.test(name + symbol)) throw Error("Name and symbol must be short printable text.");
      const supply = positiveUnits(value(data, "supply"), 18);
      const recipient = requiredAddress(value(data, "recipient"));
      const cap = preset === "advanced" ? positiveUnits(value(data, "cap"), 18) : supply;
      if (cap < supply) throw Error("Advanced cap must be at least the initial supply.");
      return { kind, preset, name, symbol, supply, cap, beneficiary: recipient, minting: data.has("minting"), burning: data.has("burning"), pausing: data.has("pausing") };
    }
    const token = requiredAddress(value(data, "token"));
    if ((await publicClient.getCode({ address: token })) === undefined) throw Error("No token contract exists at this local address.");
    const d = await decimals(token);
    if (kind === "multisender") {
      const batch = parseRecipientsCsv(value(data, "recipients"), d, account);
      if (await balance(token, account) < batch.total) throw Error("Local token balance is below the batch total.");
      return { kind, token, decimals: d, recipients: batch.recipients, total: batch.total };
    }
    const amount = positiveUnits(value(data, "amount"), d);
    if (await balance(token, account) < amount) throw Error("Local token balance is below the funding amount.");
    const beneficiary = requiredAddress(value(data, "beneficiary"));
    const block = await publicClient.getBlock();
    if (kind === "token-locker") {
      const unlock = utcSeconds(value(data, "unlock"));
      if (unlock <= block.timestamp) throw Error("Unlock must be later than the current local block time.");
      return { kind, token, decimals: d, amount, beneficiary, unlock };
    }
    const start = utcSeconds(value(data, "start"));
    const durationDays = value(data, "durationDays");
    if (!/^[1-9]\d{0,4}$/.test(durationDays)) throw Error("Duration must be 1–99,999 whole days.");
    const duration = BigInt(durationDays) * 86400n;
    const cliff = value(data, "cliff") ? utcSeconds(value(data, "cliff")) : start;
    if (start <= block.timestamp || cliff < start || cliff > start + duration) throw Error("Start must be future and cliff inside the schedule.");
    return { kind, token, decimals: d, amount, beneficiary, start, duration, cliff };
  }
  function preview(p: Prepared) {
    if (p.kind === "token-creator") return `${p.preset} token · ${p.name} (${p.symbol}) · ${formatUnits(p.supply!,18)} initial · recipient ${p.beneficiary}\nCap ${formatUnits(p.cap!,18)} · mint ${p.minting ? "enabled" : "disabled"} · burn ${p.burning ? "enabled" : "disabled"} · pause ${p.pausing ? "enabled" : "disabled"}. Creator ${account} controls enabled roles. Advanced default admin is unique; transfer requires acceptance after one day. No PIT role.`;
    if (p.kind === "multisender") return `${p.recipients!.length} distinct recipients · total ${formatUnits(p.total!,p.decimals!)} token units · standard token ${p.token}. All-or-nothing; nonstandard fee/rebase tokens may revert.\n${p.recipients!.map((r) => `${r.address}: ${formatUnits(r.amount,p.decimals!)} token units`).join("\n")}`;
    if (p.kind === "token-locker") return `${formatUnits(p.amount!,p.decimals!)} token units of ${p.token} locked for ${p.beneficiary} until ${new Date(Number(p.unlock!)*1000).toISOString()}. Beneficiary immutable; no early release.`;
    return `${formatUnits(p.amount!,p.decimals!)} token units of ${p.token} vest for ${p.beneficiary} from ${new Date(Number(p.start!)*1000).toISOString()} for ${p.duration!/86400n} days; cliff ${new Date(Number(p.cliff!)*1000).toISOString()}. Fully fund before start.`;
  }
  function deployment(p: Prepared) {
    if (p.kind === "token-creator") return { abi: factoryAbi, bytecode: contracts.PitTokenFactory.bytecode as Hex, args: [] as unknown[] };
    if (p.kind === "multisender") return { abi: senderAbi, bytecode: contracts.PitMultiSender.bytecode as Hex, args: [] as unknown[] };
    if (p.kind === "token-locker") return { abi: lockAbi, bytecode: contracts.PitTokenLock.bytecode as Hex, args: [p.token, p.beneficiary, p.unlock] };
    return { abi: vestAbi, bytecode: contracts.PitTokenVesting.bytecode as Hex, args: [p.token, p.beneficiary, p.start, p.duration, p.cliff, p.amount] };
  }
  connectButton.addEventListener("click", async () => {
    try {
      if (!window.ethereum) throw Error("No injected wallet found. Use an Anvil test wallet only.");
      account = undefined; prepared = undefined; simulated = false;
      simulateButton.disabled = true; executeButton.disabled = true;
      walletState.textContent = "Awaiting connection";
      await assertLocalChain();
      const list = await window.ethereum.request({ method: "eth_requestAccounts" }) as string[];
      account = requiredAddress(list[0] ?? "");
      walletState.textContent = `Connected local account ${account.slice(0, 6)}…${account.slice(-4)} · chain 31337`;
      set("Awaiting input", "Connected address is not a signature or transaction.");
    } catch (error) { set("Wrong network / connection error", String(error), true); }
  });
  form.addEventListener("input", () => { prepared = undefined; simulated = false; simulateButton.disabled = true; executeButton.disabled = true; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    try { prepared = await prepare(new FormData(form)); simulated = false; simulateButton.disabled = false; executeButton.disabled = true; set("Ready to simulate", preview(prepared)); }
    catch (error) { prepared = undefined; simulateButton.disabled = true; executeButton.disabled = true; set("Invalid input", String(error), true); }
  });
  simulateButton.addEventListener("click", async () => {
    if (!prepared || busy) return;
    try {
      busy = true; await assertLocalChain();
      const d = deployment(prepared);
      const data = encodeDeployData({ abi: d.abi, bytecode: d.bytecode, args: d.args });
      const gas = await publicClient.estimateGas({ account: account!, data });
      simulated = true; executeButton.disabled = false;
      set("Ready for local execution", `${preview(prepared)}\nLocal helper deployment estimate: ${gas} gas. Subsequent approve/fund/create/send gas is checked after deployment. PIT fee: inactive. Remote gas and total: not quoted.`);
    } catch (error) { simulated = false; executeButton.disabled = true; set("Simulation failure", String(error), true); }
    finally { busy = false; }
  });
  executeButton.addEventListener("click", async () => {
    if (!prepared || !simulated || busy) return;
    busy = true; executeButton.disabled = true; simulateButton.disabled = true;
    const p = prepared;
    try {
      await assertLocalChain(); set("Pending", "Awaiting local wallet transactions and receipts. Do not resubmit.");
      const d = deployment(p);
      const helper = await deploy(d.abi, d.bytecode, d.args);
      let details = `Helper ${helper.address} · receipt ${helper.hash} · gas ${helper.gas}.\n`;
      if (p.kind === "token-creator") {
        const advanced = p.preset === "advanced";
        const args = advanced ? [p.name, p.symbol, p.supply, p.cap, p.beneficiary, p.minting, p.burning, p.pausing] : [p.name, p.symbol, p.supply, p.beneficiary];
        const made = await call(helper.address, factoryAbi, advanced ? "createAdvanced" : "createStandard", args);
        const created = made.logs.map((log) => { try { return decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics }); } catch { return undefined; } }).find((event) => event?.eventName === "TokenCreated");
        const token = (created?.args as { token?: Address } | undefined)?.token;
        if (!token) throw Error("Creation receipt lacks TokenCreated event; inspect local chain before retrying.");
        const supply = await publicClient.readContract({ address: token, abi: erc20Abi, functionName: "totalSupply" });
        const recipientBalance = await balance(token, p.beneficiary!);
        details += `Created token ${token} · receipt ${made.hash} · gas ${made.gas}. Readback supply ${supply}, initial recipient balance ${recipientBalance} raw units.`;
      } else if (p.kind === "multisender") {
        details += `${await approval(p.token!, helper.address, p.total!)}\n`;
        const recipients = p.recipients!.map((r) => r.address), amounts = p.recipients!.map((r) => r.amount);
        const sent = await call(helper.address, senderAbi, "send", [p.token, recipients, amounts]);
        const verified = await Promise.all(p.recipients!.map((r) => balance(p.token!, r.address)));
        details += `Batch receipt ${sent.hash} · local estimate ${sent.gasEstimate} gas · used ${sent.gas}. Readback recipient balances (raw): ${verified.join(", ")}.`;
      } else {
        details += `${await approval(p.token!, helper.address, p.amount!)}\n`;
        const funded = await call(helper.address, p.kind === "token-locker" ? lockAbi : vestAbi, "fund", p.kind === "token-locker" ? [p.amount] : []);
        const fundedBalance = await balance(p.token!, helper.address);
        if (fundedBalance < p.amount!) throw Error("Funding readback below expected amount; inspect local chain.");
        details += `Funding receipt ${funded.hash} · gas ${funded.gas}. Locked contract balance ${fundedBalance} raw units. Save this schedule address for later release.`;
      }
      set("Success · local receipts confirmed", details);
    } catch (error) { set("Failed or reverted · inspect local chain", String(error), true); }
    finally { busy = false; }
  });
  document.querySelector<HTMLInputElement>("#recipients-file")?.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 262_144) { set("Invalid CSV", "CSV exceeds 256 KiB.", true); return; }
    const textarea = form.elements.namedItem("recipients") as HTMLTextAreaElement;
    textarea.value = await file.text(); textarea.dispatchEvent(new Event("input", { bubbles: true }));
    set("CSV loaded locally", `${file.name} · ${file.size} bytes. Validate to preview recipients; no upload occurred.`);
  });
  document.querySelector<HTMLButtonElement>("#release")?.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    try {
      await assertLocalChain();
      const address = requiredAddress(document.querySelector<HTMLInputElement>("#release-address")!.value.trim());
      const abi = kind === "token-locker" ? lockAbi : vestAbi;
      const beneficiary = await publicClient.readContract({ address, abi, functionName: "beneficiary" }) as Address;
      if (beneficiary.toLowerCase() !== account?.toLowerCase()) throw Error("Connected wallet is not this schedule's beneficiary.");
      const token = await publicClient.readContract({ address, abi, functionName: "token" }) as Address;
      const before = await balance(token, beneficiary);
      const released = await call(address, abi, "release", []);
      const after = await balance(token, beneficiary);
      set("Success · local release confirmed", `Release receipt ${released.hash} · gas ${released.gas}. Beneficiary token balance increased by ${after - before} raw units.`);
    } catch (error) { set("Release unavailable or failed", String(error), true); }
    finally { busy = false; }
  });
}
