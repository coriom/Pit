import { createPublicClient, createWalletClient, custom, http, encodeDeployData, encodeFunctionData, formatEther, formatUnits, keccak256, type Abi, type Address, type Hex, type EIP1193Provider } from "viem";
import { foundry } from "viem/chains";
import { contracts } from "./generated/contracts";
import { scheduleRuntime } from "./generated/schedule-runtime";
import { matchesReviewedRuntime } from "./lib/reviewed-runtime";
import { positiveUnits, requiredAddress } from "./lib/inputs";
import { addresses, metadataUri, nativeRecipients, nftRecipients, tokenAddresses, unsignedInteger } from "./lib/phase5-inputs";
import type { Phase5OperationId } from "./lib/catalog";

const rpc = "http://127.0.0.1:8545";
const client = createPublicClient({ chain: foundry, transport: http(rpc, { timeout: 10_000, retryCount: 0 }) });
const erc20 = contracts.PitStandardToken.abi as Abi;
const advanced = contracts.PitAdvancedToken.abi as Abi;
const erc721 = contracts.PitNftCollection.abi as Abi;
const nativeSender = contracts.PitNativeMultiSender.abi as Abi;
const nftSender = contracts.PitNftBatchSender.abi as Abi;
const lockAbi = contracts.PitTokenLock.abi as Abi;
const vestAbi = contracts.PitTokenVesting.abi as Abi;
const root = document.querySelector<HTMLElement>("#operation-root");
const operation = root?.dataset.operation as Phase5OperationId | undefined;
const token = '<label>Contract address<input name="token" required autocomplete="off" placeholder="0x…" /></label>';
const address = '<label>Address<input name="address" required autocomplete="off" placeholder="0x…" /></label>';
const csv = (label: string, name: string, placeholder: string) => `<label>${label}<textarea name="${name}" required placeholder="${placeholder}"></textarea></label><label>Import local CSV<input type="file" data-target="${name}" accept=".csv,text/csv" /></label>`;
const fields: Record<Phase5OperationId, string> = {
  "token-management": `${token}<label>Action<select name="action"><option value="inspect">Inspect only</option><option value="mint">Mint as minter</option><option value="burn">Burn my tokens</option><option value="pause">Pause as pauser</option><option value="unpause">Unpause as pauser</option><option value="grant-minter">Grant minter role</option><option value="revoke-minter">Revoke minter role</option><option value="grant-pauser">Grant pauser role</option><option value="revoke-pauser">Revoke pauser role</option></select></label><label>Target address for mint, role change or role inspection<input name="target" placeholder="0x…" /></label><label>Amount for mint or burn<input name="amount" inputmode="decimal" placeholder="1" /></label><p class="muted">Only a PIT advanced token with an enabled feature may write. Role inspection covers the named address, not every role holder. Default administrator transfers remain subject to the contract's one-day rule; this console does not change that rule.</p>`,
  "allowance-manager": `${token}<label>Owner address<input name="owner" required placeholder="0x…" /></label><label>Spender address<input name="spender" required placeholder="0x…" /></label><label>New allowance, at most current<input name="amount" inputmode="decimal" value="0" /></label><p class="muted">Only the stated owner can reduce or revoke an allowance. ERC-20 has no universal spender enumeration; enter each spender explicitly.</p>`,
  "batch-balance-checker": `${csv("Wallet addresses, one per row or address CSV", "addresses", "address&#10;0x…")}<label>ERC-20 token addresses, one per row (optional)<textarea name="tokens" placeholder="token&#10;0x…"></textarea></label><label>Import token-address CSV<input type="file" data-target="tokens" accept=".csv,text/csv" /></label><p class="muted">Local Anvil only: 1–50 distinct wallets and at most five tokens; four concurrent RPC reads. Failed reads are marked unavailable, never zero. Addresses queried are visible to the local RPC.</p>`,
  "native-multisender": `${csv("Recipients (address,amount in ETH)", "recipients", "address,amount&#10;0x…,0.1")}<p class="muted">1–100 unique recipients. One locally deployed helper performs an atomic exact-value batch. A reverting recipient reverts the entire batch.</p>`,
  "nft-creator": '<label>Collection name<input name="name" required maxlength="60" /></label><label>Symbol<input name="symbol" required maxlength="16" /></label><label>Finite supply cap<input name="cap" required inputmode="numeric" value="100" /></label><label>First recipient<input name="recipient" required placeholder="0x…" /></label><label>First token metadata URI<input name="uri" required placeholder="ipfs://… or https://…" /></label><p class="muted">The connected wallet owns the collection and alone may mint. PIT does not host or pin metadata; the URI target may change or disappear.</p>',
  "nft-batch-sender": `${token}${csv("Token IDs and recipients (tokenId,address)", "recipients", "tokenId,address&#10;1,0x…")}<p class="muted">1–50 distinct token IDs. Only exact per-token approvals are requested; any existing blanket approval is shown but never requested by PIT. A failed safe transfer reverts all transfers.</p>`,
  "locker-manager": `${address}<p class="muted">Import a known PIT lock by exact address. PIT does not claim to discover all locks. Release only as the immutable beneficiary after the real local unlock timestamp.</p>`,
  "vesting-manager": `${address}<p class="muted">Import a known PIT vesting schedule. The immutable beneficiary may release only the currently vested, unreleased amount.</p>`,
};

if (root && operation && fields[operation]) {
  const readOnly = operation === "batch-balance-checker";
  root.innerHTML = `<section class="panel"><h2>Local wallet and network</h2><button type="button" id="connect" ${readOnly ? "hidden" : ""}>Connect local wallet</button><p id="wallet-state" role="status">${readOnly ? "No wallet required" : "Disconnected"}</p></section><form id="phase5-form" class="panel"><h2>Configure and review</h2>${fields[operation]}<div class="actions"><button type="submit">Validate and review</button><button type="button" id="simulate" disabled>Simulate or inspect</button><button type="button" id="execute" disabled>${readOnly ? "Read balances" : "Confirm local operation"}</button></div></form><section class="panel"><h2>Result</h2><p id="lifecycle" role="status" aria-live="polite">Idle</p><pre id="result" aria-live="polite">Enter inputs to begin.</pre><button id="export" type="button" hidden>Download local CSV or JSON</button></section>`;
  boot(operation);
}

function boot(kind: Phase5OperationId) {
  const form = document.querySelector<HTMLFormElement>("#phase5-form")!;
  const lifecycle = document.querySelector<HTMLElement>("#lifecycle")!;
  const result = document.querySelector<HTMLElement>("#result")!;
  const walletState = document.querySelector<HTMLElement>("#wallet-state")!;
  const simulateButton = document.querySelector<HTMLButtonElement>("#simulate")!;
  const executeButton = document.querySelector<HTMLButtonElement>("#execute")!;
  const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
  let provider: EIP1193Provider | undefined, account: Address | undefined, prepared: any, busy = false;
  let exportBody = "", exportName = "";
  const set = (state: string, detail: string, bad = false) => { lifecycle.textContent = state; result.textContent = detail; result.className = bad ? "danger" : ""; };
  const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
  const clear = () => { prepared = undefined; simulateButton.disabled = true; executeButton.disabled = true; exportButton.hidden = true; exportBody = ""; };
  const read = (address: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => client.readContract({ address, abi, functionName, args }) as Promise<any>;
  async function assertLocal(requireAccount = true) {
    if (!["localhost", "127.0.0.1"].includes(location.hostname) || await client.getChainId() !== 31337) throw Error("Only local Anvil chain 31337 is supported.");
    if (!requireAccount) return;
    if (!provider || !account || await provider.request({ method: "eth_chainId" }) !== "0x7a69") throw Error("Connect a local Anvil wallet on chain 31337.");
    const active = await provider.request({ method: "eth_accounts" }) as string[];
    if (active.length !== 1 || active[0].toLowerCase() !== account.toLowerCase()) { clear(); throw Error("Wallet account changed; reconnect and review."); }
  }
  async function transact(to: Address | undefined, data: Hex, value = 0n) {
    await assertLocal();
    const from = account!;
    await client.call({ account: from, to, data, value });
    const gas = await client.estimateGas({ account: from, to, data, value });
    if (gas >= (await client.getBlock()).gasLimit / 2n) throw Error("Gas exceeds half the local block limit.");
    await assertLocal();
    const wallet = createWalletClient({ account: from, chain: foundry, transport: custom(provider!) });
    const hash = await wallet.sendTransaction({ account: from, chain: foundry, to, data, value, gas: gas + gas / 5n });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw Error(`Local transaction reverted: ${hash}`);
    const transaction = await client.getTransaction({ hash });
    if (transaction.from.toLowerCase() !== from.toLowerCase() || (transaction.to?.toLowerCase() ?? null) !== (to?.toLowerCase() ?? null) || keccak256(transaction.input) !== keccak256(data) || transaction.value !== value) throw Error("Receipt transaction differs from the reviewed local request.");
    return receipt;
  }
  async function deploy(name: "PitNativeMultiSender" | "PitNftCollection" | "PitNftBatchSender", args: readonly unknown[] = []) {
    const artifact = contracts[name];
    const receipt = await transact(undefined, encodeDeployData({ abi: artifact.abi as Abi, bytecode: artifact.bytecode as Hex, args }));
    if (!receipt.contractAddress || !(await client.getCode({ address: receipt.contractAddress }))) throw Error("Deployment receipt lacks reviewed contract code.");
    return receipt;
  }
  async function call(to: Address, abi: Abi, functionName: string, args: readonly unknown[] = [], value = 0n) {
    return transact(to, encodeFunctionData({ abi, functionName, args }), value);
  }
  function offerExport(body: string, name: string) { exportBody = body; exportName = name; exportButton.hidden = false; }
  exportButton.addEventListener("click", () => {
    if (!exportBody) return;
    const url = URL.createObjectURL(new Blob([exportBody], { type: exportName.endsWith(".csv") ? "text/csv" : "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = exportName; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  document.querySelector<HTMLButtonElement>("#connect")?.addEventListener("click", async () => {
    try {
      const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
      if (!injected) throw Error("No injected local test wallet found.");
      provider = injected; account = undefined; clear();
      const list = await injected.request({ method: "eth_requestAccounts" }) as string[];
      if (list.length !== 1) throw Error("Select exactly one local test account.");
      account = requiredAddress(list[0]); await assertLocal();
      walletState.textContent = `${account.slice(0, 6)}…${account.slice(-4)} · Anvil 31337`;
      set("Connected", "Connection is not a transaction. Validate an operation next.");
    } catch (error) { account = undefined; clear(); set("Connection failed", String(error), true); }
  });
  form.addEventListener("input", clear);
  for (const input of document.querySelectorAll<HTMLInputElement>("input[type=file][data-target]")) input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 262_144) { set("Invalid CSV", "File exceeds 256 KiB.", true); return; }
    const target = form.elements.namedItem(input.dataset.target!) as HTMLTextAreaElement;
    target.value = await file.text(); target.dispatchEvent(new Event("input", { bubbles: true }));
    set("CSV loaded locally", `${file.size} bytes. Validate before any action.`);
  });
  async function review(data: FormData) {
    await assertLocal(kind === "batch-balance-checker" ? false : kind !== "token-management" && kind !== "allowance-manager" && kind !== "locker-manager" && kind !== "vesting-manager");
    if (kind === "batch-balance-checker") {
      const wallets = addresses(field(data, "addresses")), tokens = tokenAddresses(field(data, "tokens"));
      return { kind, wallets, tokens, detail: `${wallets.length} wallets × ${tokens.length} ERC-20 tokens plus native ETH. Read-only local RPC; failures are reported individually.` };
    }
    if (kind === "native-multisender") {
      const batch = nativeRecipients(field(data, "recipients"), account!);
      if (await client.getBalance({ address: account! }) < batch.total) throw Error("Insufficient local ETH for exact batch value and gas.");
      return { kind, ...batch, detail: `${batch.entries.length} recipients; exact value ${formatEther(batch.total)} ETH; helper deployed locally; all-or-nothing.\n${batch.entries.map((entry) => `${entry.address}: ${formatEther(entry.amount)} ETH`).join("\n")}` };
    }
    if (kind === "nft-creator") {
      const name = field(data, "name"), symbol = field(data, "symbol");
      if (!name || !symbol || name.length > 60 || symbol.length > 16 || /[\u0000-\u001f]/.test(name + symbol)) throw Error("Name and symbol must be short printable strings.");
      const cap = unsignedInteger(field(data, "cap"), 1n, 1_000_000n), recipient = requiredAddress(field(data, "recipient")), uri = metadataUri(field(data, "uri"));
      return { kind, name, symbol, cap, recipient, uri, detail: `${name} (${symbol}); maximum ${cap} NFTs; connected account owns the collection; mint token #1 to ${recipient}; metadata ${uri}. URI persistence depends on its external host.` };
    }
    if (kind === "nft-batch-sender") {
      const collection = requiredAddress(field(data, "token")), entries = nftRecipients(field(data, "recipients"));
      for (const entry of entries) {
        if (entry.address.toLowerCase() === account!.toLowerCase()) throw Error("Sender cannot also be a recipient in this batch.");
        if ((await read(collection, erc721, "ownerOf", [entry.id]) as Address).toLowerCase() !== account!.toLowerCase()) throw Error(`Connected wallet does not own NFT #${entry.id}.`);
      }
      return { kind, collection, entries, detail: `${entries.length} NFT transfers from ${collection}. Exact per-token approvals may be required; no blanket approval will be requested.\n${entries.map((entry) => `#${entry.id} → ${entry.address}`).join("\n")}` };
    }
    if (kind === "token-management") {
      const targetToken = requiredAddress(field(data, "token")), action = field(data, "action");
      const [name, symbol, decimals, supply] = await Promise.all([read(targetToken, erc20, "name"), read(targetToken, erc20, "symbol"), read(targetToken, erc20, "decimals"), read(targetToken, erc20, "totalSupply")]);
      let advancedInfo: any = undefined;
      try {
        const [cap, minting, burning, pausing, paused, admin, delay, pending] = await Promise.all([
          read(targetToken, advanced, "cap"), read(targetToken, advanced, "mintingEnabled"), read(targetToken, advanced, "burningEnabled"), read(targetToken, advanced, "pausingEnabled"), read(targetToken, advanced, "paused"), read(targetToken, advanced, "defaultAdmin"), read(targetToken, advanced, "defaultAdminDelay"), read(targetToken, advanced, "pendingDefaultAdmin"),
        ]);
        advancedInfo = { cap, minting, burning, pausing, paused, admin, delay, pending };
      } catch { if (action !== "inspect") throw Error("This token does not expose the reviewed PIT advanced capabilities."); }
      let detail = `${name} (${symbol}), ${decimals} decimals, supply ${formatUnits(supply, decimals)}. ${advancedInfo ? `Cap ${formatUnits(advancedInfo.cap, decimals)}; mint ${advancedInfo.minting}; burn ${advancedInfo.burning}; pause ${advancedInfo.pausing}; paused ${advancedInfo.paused}; default admin ${advancedInfo.admin}; transfer delay ${advancedInfo.delay} seconds; pending admin ${String(advancedInfo.pending)}.` : "Standard fixed-supply token; no PIT admin controls detected."}`;
      const subject = field(data, "target") ? requiredAddress(field(data, "target")) : account;
      if (advancedInfo && subject) {
        const [mintRole, pauseRole, adminRole] = await Promise.all([read(targetToken, advanced, "MINTER_ROLE"), read(targetToken, advanced, "PAUSER_ROLE"), read(targetToken, advanced, "DEFAULT_ADMIN_ROLE")]);
        const [isMinter, isPauser, isAdmin] = await Promise.all([read(targetToken, advanced, "hasRole", [mintRole, subject]), read(targetToken, advanced, "hasRole", [pauseRole, subject]), read(targetToken, advanced, "hasRole", [adminRole, subject])]);
        detail += ` Roles for ${subject}: minter ${isMinter}, pauser ${isPauser}, default administrator ${isAdmin}. Other holders are not enumerated.`;
      }
      if (action === "inspect") return { kind, targetToken, action, detail };
      await assertLocal();
      if (!advancedInfo) throw Error("Advanced contract required.");
      const mintRole = await read(targetToken, advanced, "MINTER_ROLE"), pauseRole = await read(targetToken, advanced, "PAUSER_ROLE"), adminRole = await read(targetToken, advanced, "DEFAULT_ADMIN_ROLE");
      let args: unknown[] = [], functionName = action, target: Address | undefined;
      if (action === "mint" || action === "burn") {
        const amount = positiveUnits(field(data, "amount"), Number(decimals));
        if (action === "mint") {
          if (!advancedInfo.minting || !await read(targetToken, advanced, "hasRole", [mintRole, account!]) || supply + amount > advancedInfo.cap) throw Error("Minting disabled, unauthorized or above cap.");
          target = requiredAddress(field(data, "target")); args = [target, amount];
        } else {
          if (!advancedInfo.burning || await read(targetToken, advanced, "balanceOf", [account!]) < amount) throw Error("Burn disabled or insufficient own balance.");
          args = [amount];
        }
      } else if (action === "pause" || action === "unpause") {
        if (!advancedInfo.pausing || !await read(targetToken, advanced, "hasRole", [pauseRole, account!]) || Boolean(advancedInfo.paused) === (action === "pause")) throw Error("Pausing disabled, unauthorized or already in requested state.");
      } else if (/^(grant|revoke)-(minter|pauser)$/.test(action)) {
        const role = action.endsWith("minter") ? mintRole : pauseRole;
        if (!(action.endsWith("minter") ? advancedInfo.minting : advancedInfo.pausing) || !await read(targetToken, advanced, "hasRole", [adminRole, account!])) throw Error("Feature disabled or connected account is not default administrator.");
        target = requiredAddress(field(data, "target"));
        functionName = action.startsWith("grant") ? "grantRole" : "revokeRole"; args = [role, target];
      } else throw Error("Unsupported token administration action.");
      return { kind, targetToken, action, functionName, args, target, detail: `${detail}\nRequested ${action}${target ? ` for ${target}` : ""}. Local wallet confirmation required.` };
    }
    if (kind === "allowance-manager") {
      const targetToken = requiredAddress(field(data, "token")), owner = requiredAddress(field(data, "owner")), spender = requiredAddress(field(data, "spender"));
      const [decimals, symbol, current] = await Promise.all([read(targetToken, erc20, "decimals"), read(targetToken, erc20, "symbol"), read(targetToken, erc20, "allowance", [owner, spender])]);
      const amountText = field(data, "amount") || "0";
      const next = amountText === "0" ? 0n : positiveUnits(amountText, Number(decimals));
      if (next > current) throw Error("This tool only reduces or revokes an allowance.");
      const unlimited = current === (1n << 256n) - 1n;
      return { kind, targetToken, owner, spender, current, next, decimals, detail: `${symbol}: owner ${owner}; spender ${spender}; current ${formatUnits(current, decimals)}${unlimited ? " (unlimited approval)" : ""}; requested ${formatUnits(next, decimals)}. This inspect checks only the stated spender.` };
    }
    const schedule = requiredAddress(field(data, "address")), locker = kind === "locker-manager", abi = locker ? lockAbi : vestAbi;
    if (!matchesReviewedRuntime(await client.getCode({ address: schedule }), locker ? scheduleRuntime.PitTokenLock : scheduleRuntime.PitTokenVesting)) throw Error("Address does not contain reviewed PIT schedule bytecode.");
    const [tokenAddress, beneficiary, released] = await Promise.all([read(schedule, abi, "token"), read(schedule, abi, "beneficiary"), read(schedule, abi, "released")]);
    const symbol = await read(tokenAddress, erc20, "symbol"), decimals = Number(await read(tokenAddress, erc20, "decimals"));
    const info = locker ? { unlock: await read(schedule, abi, "unlockTime"), allocation: await read(schedule, abi, "deposited"), releasable: (await client.getBlock()).timestamp >= BigInt(await read(schedule, abi, "unlockTime")) ? BigInt(await read(schedule, abi, "deposited")) - BigInt(released) : 0n }
      : { start: await read(schedule, abi, "start"), duration: await read(schedule, abi, "duration"), cliff: await read(schedule, abi, "cliff"), allocation: await read(schedule, abi, "allocation"), vested: await read(schedule, abi, "vestedAt", [(await client.getBlock()).timestamp]), releasable: await read(schedule, abi, "releasable") };
    const detail = `${symbol} schedule ${schedule}; beneficiary ${beneficiary}; allocation ${formatUnits(info.allocation, decimals)}; released ${formatUnits(released, decimals)}; claimable ${formatUnits(info.releasable, decimals)}; ${locker ? `unlock ${new Date(Number(info.unlock) * 1000).toISOString()}` : `start ${new Date(Number(info.start) * 1000).toISOString()}, cliff ${new Date(Number(info.cliff) * 1000).toISOString()}, duration ${info.duration}s, vested ${formatUnits(info.vested, decimals)}`}.`;
    return { kind, schedule, tokenAddress, beneficiary, released, info, detail };
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); clear();
    try { prepared = await review(new FormData(form)); simulateButton.disabled = false; set("Reviewed", prepared.detail); }
    catch (error) { set("Invalid or unavailable", String(error), true); }
  });
  simulateButton.addEventListener("click", async () => {
    if (!prepared || busy) return;
    try {
      busy = true; await assertLocal(prepared.kind !== "batch-balance-checker" && prepared.action !== "inspect");
      if (prepared.kind === "token-management" && prepared.action !== "inspect") await client.call({ account: account!, to: prepared.targetToken, data: encodeFunctionData({ abi: advanced, functionName: prepared.functionName, args: prepared.args }) });
      if (prepared.kind === "allowance-manager" && prepared.next !== prepared.current) {
        if (!account || account.toLowerCase() !== prepared.owner.toLowerCase()) throw Error("Only the stated owner can change an allowance.");
        await client.call({ account, to: prepared.targetToken, data: encodeFunctionData({ abi: erc20, functionName: "approve", args: [prepared.spender, prepared.next] }) });
      }
      if ((prepared.kind === "locker-manager" || prepared.kind === "vesting-manager") && BigInt(prepared.info.releasable) > 0n) {
        if (!account || account.toLowerCase() !== prepared.beneficiary.toLowerCase()) throw Error("Only the immutable beneficiary may release.");
        await client.call({ account, to: prepared.schedule, data: encodeFunctionData({ abi: prepared.kind === "locker-manager" ? lockAbi : vestAbi, functionName: "release" }) });
      }
      if (prepared.kind === "nft-creator" || prepared.kind === "native-multisender" || prepared.kind === "nft-batch-sender") {
        const name = prepared.kind === "nft-creator" ? "PitNftCollection" : prepared.kind === "native-multisender" ? "PitNativeMultiSender" : "PitNftBatchSender";
        const artifact = contracts[name];
        const args = name === "PitNftCollection" ? [prepared.name, prepared.symbol, account, prepared.cap] : [];
        const data = encodeDeployData({ abi: artifact.abi as Abi, bytecode: artifact.bytecode as Hex, args });
        const gas = await client.estimateGas({ account: account!, data });
        if (gas >= (await client.getBlock()).gasLimit / 2n) throw Error("Deployment gas exceeds half the local block limit.");
        prepared.deployGas = gas;
      }
      executeButton.disabled = prepared.kind === "token-management" && prepared.action === "inspect"
        || prepared.kind === "allowance-manager" && prepared.next === prepared.current
        || (prepared.kind === "locker-manager" || prepared.kind === "vesting-manager") && BigInt(prepared.info.releasable) === 0n;
      set("Simulated and ready", `${prepared.detail}\n${prepared.deployGas ? `Local deployment estimate ${prepared.deployGas} gas. ` : ""}Only Anvil transactions are permitted; verify each wallet prompt. PIT fee inactive.`);
    } catch (error) { executeButton.disabled = true; set("Simulation failed", String(error), true); }
    finally { busy = false; }
  });
  executeButton.addEventListener("click", async () => {
    if (!prepared || busy) return;
    busy = true; executeButton.disabled = true; simulateButton.disabled = true;
    const p = prepared;
    try {
      await assertLocal(p.kind !== "batch-balance-checker");
      set("Pending", "Local transaction or bounded read in progress. Do not resubmit.");
      if (p.kind === "batch-balance-checker") {
        const tokenMeta = await Promise.all(p.tokens.map(async (target: Address) => {
          try { const [symbol, decimals] = await Promise.all([read(target, erc20, "symbol"), read(target, erc20, "decimals")]); if (Number(decimals) > 36) throw Error("Unsupported decimals"); return { target, symbol: String(symbol), decimals: Number(decimals) }; }
          catch { return { target, symbol: "UNAVAILABLE", decimals: null }; }
        }));
        const tasks = p.wallets.flatMap((owner: Address) => [{ owner, asset: "ETH", unit: 18, fetch: () => client.getBalance({ address: owner }) }, ...tokenMeta.map((meta: any) => ({ owner, asset: meta.target, unit: meta.decimals, fetch: () => meta.decimals === null ? Promise.reject(Error("Token metadata unavailable")) : read(meta.target, erc20, "balanceOf", [owner]) }))]);
        const lines = ["address,asset,balance,status"];
        let next = 0;
        await Promise.all(Array.from({ length: 4 }, async () => {
          while (next < tasks.length) {
            const index = next++, task = tasks[index];
            try { const balance = await task.fetch(); lines[index + 1] = `${task.owner},${task.asset},${formatUnits(balance, task.unit)},ok`; }
            catch { lines[index + 1] = `${task.owner},${task.asset},,unavailable`; }
          }
        }));
        const body = lines.join("\n") + "\n";
        offerExport(body, "pit-local-balances.csv");
        set("Read complete", `${tasks.length} bounded reads; ${lines.filter((line) => line.endsWith(",unavailable")).length} unavailable.\n${body}`);
      } else if (p.kind === "native-multisender") {
        const receipt = await deploy("PitNativeMultiSender"); const helper = receipt.contractAddress!;
        const before = await Promise.all(p.entries.map((entry: any) => client.getBalance({ address: entry.address })));
        const sent = await call(helper, nativeSender, "send", [p.entries.map((entry: any) => entry.address), p.entries.map((entry: any) => entry.amount)], p.total);
        const after = await Promise.all(p.entries.map((entry: any) => client.getBalance({ address: entry.address })));
        if (after.some((value, index) => value - before[index] !== p.entries[index].amount) || await client.getBalance({ address: helper }) !== 0n) throw Error("ETH conservation readback failed.");
        set("Receipt confirmed · balances checked", `Helper ${helper}; deploy ${receipt.transactionHash}; batch ${sent.transactionHash}; ${p.entries.length} recipients received exactly ${formatEther(p.total)} ETH; helper balance zero.`);
      } else if (p.kind === "nft-creator") {
        const receipt = await deploy("PitNftCollection", [p.name, p.symbol, account, p.cap]); const collection = receipt.contractAddress!;
        if ((await read(collection, erc721, "owner") as Address).toLowerCase() !== account!.toLowerCase()) throw Error("Collection owner mismatch.");
        const mint = await call(collection, erc721, "mint", [p.recipient, p.uri]);
        if ((await read(collection, erc721, "ownerOf", [1n]) as Address).toLowerCase() !== p.recipient.toLowerCase() || await read(collection, erc721, "tokenURI", [1n]) !== p.uri || await read(collection, erc721, "maxSupply") !== p.cap) throw Error("NFT ownership, URI or cap readback failed.");
        offerExport(JSON.stringify({ chainId: 31337, collection, owner: account, cap: String(p.cap), deploy: receipt.transactionHash, mint: mint.transactionHash }, null, 2), "pit-local-nft-collection.json");
        set("Receipt confirmed · NFT checked", `Collection ${collection}; deploy ${receipt.transactionHash}; mint ${mint.transactionHash}; #1 owner ${p.recipient}; URI ${p.uri}.`);
      } else if (p.kind === "nft-batch-sender") {
        const receipt = await deploy("PitNftBatchSender"); const helper = receipt.contractAddress!;
        set("Review exact NFT approvals", `Spender ${helper}; collection ${p.collection}; token IDs ${p.entries.map((entry: any) => entry.id).join(", ")}. A deployed helper cannot move other tokens without their own approvals.`);
        if (!window.confirm(`Approve only the listed NFT token IDs for local helper ${helper}, then send the reviewed batch?`)) throw Error("NFT approvals cancelled; helper deployed but no approvals requested.");
        const approvals: string[] = [];
        for (const entry of p.entries) {
          const exact = await read(p.collection, erc721, "getApproved", [entry.id]);
          const blanket = await read(p.collection, erc721, "isApprovedForAll", [account!, helper]);
          if (exact.toLowerCase() !== helper.toLowerCase() && !blanket) approvals.push((await call(p.collection, erc721, "approve", [helper, entry.id])).transactionHash);
        }
        const sent = await call(helper, nftSender, "send", [p.collection, p.entries.map((entry: any) => entry.id), p.entries.map((entry: any) => entry.address)]);
        for (const entry of p.entries) if ((await read(p.collection, erc721, "ownerOf", [entry.id]) as Address).toLowerCase() !== entry.address.toLowerCase()) throw Error("NFT ownership readback failed.");
        set("Receipt confirmed · NFT owners checked", `Helper ${helper}; deploy ${receipt.transactionHash}; exact approvals ${approvals.join(", ") || "none"}; batch ${sent.transactionHash}; ${p.entries.length} owners verified.`);
      } else if (p.kind === "token-management") {
        if (p.action === "inspect") { set("Inspected", p.detail); return; }
        const receipt = await call(p.targetToken, advanced, p.functionName, p.args);
        const inspectData = new FormData(form); inspectData.set("action", "inspect");
        const refreshed = await review(inspectData);
        set("Receipt confirmed · token checked", `${receipt.transactionHash}\n${refreshed.detail}`);
      } else if (p.kind === "allowance-manager") {
        if (!account || account.toLowerCase() !== p.owner.toLowerCase()) throw Error("Connected account is not the stated owner.");
        const receipt = await call(p.targetToken, erc20, "approve", [p.spender, p.next]);
        const after = await read(p.targetToken, erc20, "allowance", [p.owner, p.spender]);
        if (after !== p.next) throw Error("Allowance readback differs from requested value.");
        set("Receipt confirmed · allowance checked", `${receipt.transactionHash}; allowance for ${p.spender} is ${formatUnits(after, p.decimals)}.`);
      } else {
        if (!account || account.toLowerCase() !== p.beneficiary.toLowerCase() || BigInt(p.info.releasable) === 0n) throw Error("Nothing claimable by connected beneficiary.");
        const abi = p.kind === "locker-manager" ? lockAbi : vestAbi;
        const before = await read(p.tokenAddress, erc20, "balanceOf", [account]);
        const receipt = await call(p.schedule, abi, "release");
        const after = await read(p.tokenAddress, erc20, "balanceOf", [account]);
        const released = await read(p.schedule, abi, "released");
        const newlyReleased = BigInt(released) - BigInt(p.released);
        if (newlyReleased <= 0n || newlyReleased > BigInt(p.info.allocation) || BigInt(after) - BigInt(before) !== newlyReleased) throw Error("Release balance or state readback failed.");
        offerExport(JSON.stringify({ chainId: 31337, schedule: p.schedule, token: p.tokenAddress, beneficiary: p.beneficiary, receipt: receipt.transactionHash }, null, 2), "pit-local-schedule.json");
        set("Receipt confirmed · schedule checked", `${receipt.transactionHash}; beneficiary received ${after - before} raw units; cumulative released ${released}.`);
      }
    } catch (error) { set("Failed or uncertain · inspect local chain", String(error), true); }
    finally { busy = false; }
  });
}
