import { createPublicClient, createWalletClient, custom, encodeDeployData, encodeFunctionData, formatUnits, http, keccak256, type Abi, type Address, type EIP1193Provider, type Hex } from "viem";
import { foundry } from "viem/chains";
import { contracts } from "./generated/contracts";
import { scheduleRuntime } from "./generated/schedule-runtime";
import { matchesReviewedRuntime } from "./lib/reviewed-runtime";
import { requiredAddress } from "./lib/inputs";
import { metadataUri, unsignedInteger } from "./lib/phase5-inputs";
import { composeAirdrop, erc1155Transfers, fetchNftMetadata, filesTar, metadataCsv, metadataTar, validateNftMetadata } from "./lib/phase6-inputs";
import type { Phase6OperationId } from "./lib/catalog";

const client = createPublicClient({ chain: foundry, transport: http("http://127.0.0.1:8545", { timeout: 10_000, retryCount: 0 }) });
const nftAbi = contracts.PitNftCollection.abi as Abi;
const collectionAbi = contracts.Pit1155Collection.abi as Abi;
const senderAbi = contracts.Pit1155BatchSender.abi as Abi;
const erc721 = [
  { type: "function", name: "name", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "symbol", inputs: [], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "ownerOf", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "tokenURI", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "getApproved", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "isApprovedForAll", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "approve", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "safeTransferFrom", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
] as const satisfies Abi;
const erc1155 = [
  { type: "function", name: "balanceOf", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "uri", inputs: [{ type: "uint256" }], outputs: [{ type: "string" }], stateMutability: "view" },
  { type: "function", name: "isApprovedForAll", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "setApprovalForAll", inputs: [{ type: "address" }, { type: "bool" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "safeTransferFrom", inputs: [{ type: "address" }, { type: "address" }, { type: "uint256" }, { type: "uint256" }, { type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
] as const satisfies Abi;

const root = document.querySelector<HTMLElement>("#operation-root");
const kind = root?.dataset.operation as Phase6OperationId | undefined;
const address = (name: string, label: string) => `<label>${label}<input name="${name}" autocomplete="off" placeholder="0x…" required /></label>`;
const csv = (name: string, label: string, placeholder: string) => `<label>${label}<textarea name="${name}" required placeholder="${placeholder}"></textarea></label><label>Import local CSV<input type="file" data-target="${name}" accept=".csv,text/csv" /></label>`;
const fields: Record<Phase6OperationId, string> = {
  "nft-manager": `${address("collection", "ERC-721 collection")}<label>Token ID<input name="tokenId" inputmode="numeric" value="1" required /></label><label>Action<select name="action"><option value="inspect">Inspect</option><option value="mint">Mint as PIT collection owner</option><option value="approve">Approve one token</option><option value="revoke">Revoke one token approval</option><option value="transfer">Safe transfer my token</option></select></label><label>Recipient or approved spender<input name="target" placeholder="0x…" /></label><label>Metadata URI for mint<input name="uri" placeholder="ipfs://… or https://…" /></label><p class="muted">Read-only inspection accepts ERC-721 contracts. Writes are limited to reviewed PIT collections; burn is not implemented by the PIT ERC-721 preset. Token enumeration is not claimed. The URI host may change or disappear.</p>`,
  "erc1155-creator": `<label>URI template<input name="uri" required value="ipfs://example/{id}.json" /></label><label>First token ID<input name="tokenId" inputmode="numeric" required value="1" /></label><label>Immutable cap for this ID<input name="cap" inputmode="numeric" required value="100" /></label><label>Initial units<input name="amount" inputmode="numeric" required value="10" /></label>${address("recipient", "Initial recipient")}<p class="muted">The connected wallet becomes sole owner and minter. Each ID has a permanent cap. Holders may burn their own units. The URI uses ERC-1155 {id} substitution; PIT does not pin metadata.</p>`,
  "erc1155-manager": `${address("collection", "ERC-1155 collection")}<label>Token ID<input name="tokenId" inputmode="numeric" value="1" required /></label>${address("holder", "Account to inspect")}<label>Action<select name="action"><option value="inspect">Inspect</option><option value="define">Define a new ID as owner</option><option value="mint">Mint as PIT collection owner</option><option value="burn">Burn my units</option><option value="transfer">Transfer my units</option><option value="approve">Approve operator for entire collection</option><option value="revoke">Revoke collection-wide operator</option></select></label><label>Units or initial units<input name="amount" inputmode="numeric" value="1" /></label><label>Cap for new ID<input name="cap" inputmode="numeric" value="100" /></label><label>Recipient or operator<input name="target" placeholder="0x…" /></label><p class="muted">Read-only inspection accepts ERC-1155 contracts. Writes are limited to reviewed PIT collections. Operator approval grants access to all IDs in this collection, not one token.</p>`,
  "erc1155-multisender": `${address("collection", "ERC-1155 collection")}${csv("recipients", "Token ID, raw units, recipient (1–40)", "tokenId,amount,recipient&#10;1,2,0x…")}<label>Existing reviewed helper address (optional)<input name="helper" placeholder="0x…" /></label><p class="danger">Atomic batching requires collection-wide setApprovalForAll for the exact helper address. The helper has no PIT recovery privilege. Revoke after distribution; a separate revocation control remains available.</p>`,
  "metadata-studio": `<label>Standard<select name="standard"><option value="erc721">ERC-721</option><option value="erc1155">ERC-1155</option></select></label><label>Mode<select name="mode"><option value="json">Validate one JSON object</option><option value="csv">Generate JSON from CSV</option></select></label>${csv("source", "Local JSON or tokenId,name,description,image CSV", "tokenId,name,description,image&#10;1,Example,Description,ipfs://…")}<p class="muted">Runs entirely in this browser. Downloaded JSON must be hosted and pinned by you; PIT does not store or publish it. ERC-1155 filenames use 64-digit lowercase hexadecimal IDs.</p>`,
  "airdrop-composer": `<label>Allocation mode<select name="mode"><option value="equal">Equal</option><option value="explicit">Explicit raw units</option><option value="proportional">Proportional integer weights</option><option value="percentage">Basis points totaling 10000</option></select></label><label>Total token amount<input name="total" inputmode="decimal" required value="1" /></label><label>Token decimals<input name="decimals" inputmode="numeric" required value="18" /></label><label>Minimum allocation, optional<input name="min" inputmode="decimal" /></label>${csv("recipients", "Recipient CSV: address or address,weight", "address,weight&#10;0x…,6000")}<label>Excluded addresses, one per line<textarea name="exclude"></textarea></label><p class="muted">Imported snapshots are user supplied; PIT does not discover all holders. Deterministic largest remainders, then CSV order, receive indivisible dust. Each prepared batch is at most 100 recipients for the existing ERC-20 MultiSender.</p>`,
};

if (root && kind && fields[kind]) {
  const localOnly = kind === "metadata-studio" || kind === "airdrop-composer";
  root.innerHTML = `<section class="panel"><h2>Wallet and network</h2><button type="button" id="connect" ${localOnly ? "hidden" : ""}>Connect local wallet</button><p id="wallet-state" role="status">${localOnly ? "No wallet required" : "Disconnected"}</p></section><form id="phase6-form" class="panel"><h2>Configure and review</h2>${fields[kind]}<div class="actions"><button type="submit">Validate and review</button><button type="button" id="simulate" disabled>Simulate or inspect</button><button type="button" id="execute" disabled>Confirm local operation</button></div></form><section class="panel"><h2>Result</h2><p id="lifecycle" role="status" aria-live="polite">Idle</p><pre id="result" aria-live="polite">Enter inputs to begin.</pre><button id="export" type="button" hidden>Download local result</button>${kind === "nft-manager" ? '<button id="metadata-fetch" type="button" hidden>Inspect metadata URL (remote host sees request)</button>' : ""}</section>`;
  boot(kind);
}

function boot(operation: Phase6OperationId) {
  const form = document.querySelector<HTMLFormElement>("#phase6-form")!;
  const lifecycle = document.querySelector<HTMLElement>("#lifecycle")!;
  const result = document.querySelector<HTMLElement>("#result")!;
  const walletState = document.querySelector<HTMLElement>("#wallet-state")!;
  const simulate = document.querySelector<HTMLButtonElement>("#simulate")!;
  const execute = document.querySelector<HTMLButtonElement>("#execute")!;
  const exportButton = document.querySelector<HTMLButtonElement>("#export")!;
  const metadataButton = document.querySelector<HTMLButtonElement>("#metadata-fetch");
  let provider: EIP1193Provider | undefined, account: Address | undefined, prepared: any, busy = false;
  let download: { name: string; body: string | Uint8Array; type: string } = { name: "", body: "", type: "application/json" };
  const field = (data: FormData, key: string) => String(data.get(key) ?? "").trim();
  const set = (state: string, detail: string, bad = false) => { lifecycle.textContent = state; result.textContent = detail; result.className = bad ? "danger" : ""; };
  const clear = () => { prepared = undefined; simulate.disabled = true; execute.disabled = true; exportButton.hidden = true; if (metadataButton) metadataButton.hidden = true; };
  const read = (contract: Address, abi: Abi, functionName: string, args: readonly unknown[] = []) => client.readContract({ address: contract, abi, functionName, args }) as Promise<any>;
  async function guard(needsWallet = true) {
    if (!["localhost", "127.0.0.1"].includes(location.hostname) || await client.getChainId() !== 31337) throw Error("Only local Anvil chain 31337 is supported.");
    if (!needsWallet) return;
    if (!provider || !account || await provider.request({ method: "eth_chainId" }) !== "0x7a69") throw Error("Connect one local wallet on Anvil 31337.");
    const active = await provider.request({ method: "eth_accounts" }) as string[];
    if (active.length !== 1 || active[0].toLowerCase() !== account.toLowerCase()) { clear(); throw Error("Account changed; reconnect and review."); }
  }
  async function verified(contract: Address, name: "PitNftCollection" | "Pit1155Collection" | "Pit1155BatchSender") {
    if (!matchesReviewedRuntime(await client.getCode({ address: contract }), scheduleRuntime[name])) throw Error(`${name} bytecode does not match reviewed local artifact.`);
  }
  async function transact(to: Address | undefined, data: Hex) {
    await guard();
    const from = account!;
    await client.call({ account: from, to, data });
    const gas = await client.estimateGas({ account: from, to, data });
    if (gas >= (await client.getBlock()).gasLimit / 2n) throw Error("Gas exceeds half the local block limit.");
    await guard();
    const wallet = createWalletClient({ account: from, chain: foundry, transport: custom(provider!) });
    const hash = await wallet.sendTransaction({ account: from, chain: foundry, to, data, gas: gas + gas / 5n });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw Error(`Local transaction reverted: ${hash}`);
    const transaction = await client.getTransaction({ hash });
    if (transaction.from.toLowerCase() !== from.toLowerCase() || (transaction.to?.toLowerCase() ?? null) !== (to?.toLowerCase() ?? null) || keccak256(transaction.input) !== keccak256(data) || transaction.value !== 0n) throw Error("Receipt differs from reviewed request.");
    return receipt;
  }
  async function call(to: Address, abi: Abi, functionName: string, args: readonly unknown[]) { return transact(to, encodeFunctionData({ abi, functionName, args })); }
  async function deploy(name: "Pit1155Collection" | "Pit1155BatchSender", args: readonly unknown[] = []) {
    const artifact = contracts[name];
    const receipt = await transact(undefined, encodeDeployData({ abi: artifact.abi as Abi, bytecode: artifact.bytecode as Hex, args }));
    if (!receipt.contractAddress) throw Error("Deployment receipt has no address.");
    await verified(receipt.contractAddress, name);
    return receipt;
  }
  function offer(body: string | Uint8Array, name: string, type = "application/json") { download = { name, body, type }; exportButton.hidden = false; }
  exportButton.addEventListener("click", () => {
    if (!download.body) return;
    const payload: BlobPart = typeof download.body === "string" ? download.body : Uint8Array.from(download.body);
    const url = URL.createObjectURL(new Blob([payload], { type: download.type }));
    const link = document.createElement("a"); link.href = url; link.download = download.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  metadataButton?.addEventListener("click", async () => {
    if (!prepared?.uri) return;
    try { const metadata = await fetchNftMetadata(prepared.uri); set("Metadata inspected", `${prepared.detail}\nMetadata: ${JSON.stringify(metadata, null, 2)}\nNo executable HTML or media was loaded by PIT.`); }
    catch (error) { set("Metadata unavailable", `The metadata host may block CORS or be unavailable. ${String(error)}`, true); }
  });
  document.querySelector<HTMLButtonElement>("#connect")?.addEventListener("click", async () => {
    try {
      const injected = (window as Window & { ethereum?: EIP1193Provider }).ethereum;
      if (!injected) throw Error("No injected local test wallet found.");
      provider = injected; account = undefined; clear();
      injected.on?.("accountsChanged", () => { account = undefined; clear(); walletState.textContent = "Account changed; reconnect."; });
      injected.on?.("chainChanged", () => { account = undefined; clear(); walletState.textContent = "Network changed; reconnect."; });
      injected.on?.("disconnect", () => { account = undefined; clear(); walletState.textContent = "Disconnected"; });
      const accounts = await injected.request({ method: "eth_requestAccounts" }) as string[];
      if (accounts.length !== 1) throw Error("Select exactly one local test account.");
      account = requiredAddress(accounts[0]); await guard();
      walletState.textContent = `${account.slice(0, 6)}…${account.slice(-4)} · Anvil 31337`;
      set("Connected", "Connection is not a transaction. Validate an operation next.");
    } catch (error) { account = undefined; clear(); set("Connection failed", String(error), true); }
  });
  form.addEventListener("input", clear);
  for (const input of document.querySelectorAll<HTMLInputElement>("input[type=file][data-target]")) input.addEventListener("change", async () => {
    const file = input.files?.[0]; if (!file) return;
    if (file.size > 262_144) { set("Invalid local file", "File exceeds 256 KiB.", true); return; }
    const target = form.elements.namedItem(input.dataset.target!) as HTMLTextAreaElement;
    target.value = await file.text(); target.dispatchEvent(new Event("input", { bubbles: true }));
    set("Local file loaded", "Review the imported data before continuing.");
  });
  async function review(data: FormData) {
    if (operation === "metadata-studio") {
      const mode = field(data, "mode"), standard = field(data, "standard") as "erc721" | "erc1155";
      const source = field(data, "source");
      if (mode === "json") {
        const item = validateNftMetadata(source);
        return { kind: operation, mode, item, detail: `Valid ${standard.toUpperCase()} metadata: ${item.name}. No upload or pinning occurs.` };
      }
      const items = metadataCsv(source, standard);
      return { kind: operation, mode, items, detail: `${items.length} metadata files prepared locally. Filenames follow ${standard.toUpperCase()} conventions; no remote hosting is implied.` };
    }
    if (operation === "airdrop-composer") {
      const decimals = Number(field(data, "decimals"));
      const allocation = composeAirdrop({ mode: field(data, "mode") as "equal" | "explicit" | "proportional" | "percentage", recipients: field(data, "recipients"), total: field(data, "total"), decimals, min: field(data, "min"), exclude: field(data, "exclude") });
      return { kind: operation, allocation, decimals, detail: `${allocation.allocated.length} recipients; ${allocation.batches.length} batches of at most 100; total ${allocation.total} raw units; ${allocation.excludedCount} excluded. ${allocation.assumption} Approval and local gas depend on the chosen ERC-20 contract. Use the existing MultiSender with each exported batch.` };
    }
    await guard(false);
    if (operation === "nft-manager") {
      const collection = requiredAddress(field(data, "collection"));
      const tokenId = unsignedInteger(field(data, "tokenId"), 0n, (1n << 256n) - 1n);
      const action = field(data, "action"), target = field(data, "target") ? requiredAddress(field(data, "target")) : undefined;
      const [name, symbol] = await Promise.all([read(collection, erc721, "name"), read(collection, erc721, "symbol")]);
      let owner: Address | undefined, uri: string | undefined, approved: Address | undefined;
      try { [owner, uri, approved] = await Promise.all([read(collection, erc721, "ownerOf", [tokenId]), read(collection, erc721, "tokenURI", [tokenId]), read(collection, erc721, "getApproved", [tokenId])]); } catch { if (action !== "mint") throw Error("Token ID is not readable or does not exist."); }
      const reviewed = matchesReviewedRuntime(await client.getCode({ address: collection }), scheduleRuntime.PitNftCollection);
      let detail = `${name} (${symbol}) at ${collection}; token #${tokenId}; owner ${owner ?? "not minted"}; URI ${uri ?? "unavailable"}; approved ${approved ?? "unavailable"}. ${reviewed ? "Reviewed PIT collection." : "Third-party ERC-721 read only."}`;
      if (reviewed) {
        const [admin, maxSupply, nextId] = await Promise.all([read(collection, nftAbi, "owner"), read(collection, nftAbi, "maxSupply"), read(collection, nftAbi, "nextTokenId")]);
        detail += ` Owner/minter ${admin}; cap ${maxSupply}; next ID ${nextId}; metadata URI immutable after mint. Burn and pause are not implemented.`;
      }
      if (owner && target) detail += ` Operator ${target} approved for all: ${await read(collection, erc721, "isApprovedForAll", [owner, target])}.`;
      if (action !== "inspect") {
        await guard();
        if (!reviewed) throw Error("Writes require a reviewed PIT collection.");
        if (action === "mint") {
          if (owner) throw Error("This token ID already exists; PIT mint uses the next ID.");
          if ((await read(collection, nftAbi, "owner") as Address).toLowerCase() !== account!.toLowerCase()) throw Error("Only the collection owner may mint.");
          if (tokenId !== await read(collection, nftAbi, "nextTokenId")) throw Error("Requested token ID is not the next PIT ID.");
          if (!target) throw Error("Mint recipient is required.");
          const mintUri = metadataUri(field(data, "uri"));
          detail += ` Mint #${tokenId} to ${target} with ${mintUri}.`;
          return { kind: operation, action, collection, tokenId, target, mintUri, detail };
        }
        if (!owner || owner.toLowerCase() !== account!.toLowerCase()) throw Error("Only the current token owner is supported for approval and transfer.");
        if (action !== "revoke" && !target) throw Error("Recipient or spender is required.");
        detail += ` ${action} ${target ?? "current token approval"}; exact token only.`;
      }
      return { kind: operation, action, collection, tokenId, owner, target, uri, detail };
    }
    if (operation === "erc1155-creator") {
      await guard();
      const uri = metadataUri(field(data, "uri"));
      if (!uri.includes("{id}")) throw Error("ERC-1155 URI template must contain {id}.");
      const tokenId = unsignedInteger(field(data, "tokenId"), 0n, (1n << 256n) - 1n);
      const cap = unsignedInteger(field(data, "cap"), 1n, (1n << 256n) - 1n);
      const amount = unsignedInteger(field(data, "amount"), 0n, cap);
      const recipient = requiredAddress(field(data, "recipient"));
      return { kind: operation, uri, tokenId, cap, amount, recipient, detail: `Deploy ERC-1155 collection; connected owner ${account}; URI ${uri}; define ID ${tokenId}, cap ${cap}, initial ${amount} units to ${recipient}. Two local wallet confirmations; no PIT admin.` };
    }
    if (operation === "erc1155-manager") {
      const collection = requiredAddress(field(data, "collection"));
      const tokenId = unsignedInteger(field(data, "tokenId"), 0n, (1n << 256n) - 1n);
      const holder = requiredAddress(field(data, "holder"));
      const action = field(data, "action"), target = field(data, "target") ? requiredAddress(field(data, "target")) : undefined;
      const [balance, uri] = await Promise.all([read(collection, erc1155, "balanceOf", [holder, tokenId]), read(collection, erc1155, "uri", [tokenId])]);
      const reviewed = matchesReviewedRuntime(await client.getCode({ address: collection }), scheduleRuntime.Pit1155Collection);
      let supply: bigint | undefined, cap: bigint | undefined, owner: Address | undefined, defined: boolean | undefined;
      if (reviewed) [supply, cap, owner, defined] = await Promise.all([read(collection, collectionAbi, "totalSupply", [tokenId]), read(collection, collectionAbi, "capOf", [tokenId]), read(collection, collectionAbi, "owner"), read(collection, collectionAbi, "defined", [tokenId])]);
      let detail = `Collection ${collection}, ID ${tokenId}: ${holder} holds ${balance} units; URI ${uri}. ${reviewed ? `Defined ${defined}; supply ${supply}, cap ${cap}, owner ${owner}.` : "Third-party contract: supply and permissions unverified; read only."}`;
      if (action !== "inspect") {
        await guard();
        if (!reviewed) throw Error("Writes require a reviewed PIT ERC-1155 collection.");
        const amount = ["define", "mint", "burn", "transfer"].includes(action) ? unsignedInteger(field(data, "amount"), action === "define" ? 0n : 1n, (1n << 256n) - 1n) : 0n;
        const newCap = action === "define" ? unsignedInteger(field(data, "cap"), 1n, (1n << 256n) - 1n) : undefined;
        if (action === "define" && (defined || owner!.toLowerCase() !== account!.toLowerCase() || amount > newCap!)) throw Error("ID already defined, unauthorized, or initial amount above cap.");
        if (action === "mint" && (owner!.toLowerCase() !== account!.toLowerCase() || amount > cap! - supply!)) throw Error("Minting is unauthorized or exceeds the cap.");
        if (["burn", "transfer"].includes(action) && (holder.toLowerCase() !== account!.toLowerCase() || amount > balance)) throw Error("Only the holder may burn or transfer available units.");
        if (["define", "mint", "transfer", "approve", "revoke"].includes(action) && !target) throw Error("Recipient or operator is required.");
        detail += ` ${action} ${amount} units${target ? ` with ${target}` : ""}. ${["approve", "revoke"].includes(action) ? "Operator approval covers the entire collection." : ""}`;
        return { kind: operation, action, collection, tokenId, holder, target, amount, newCap, detail };
      }
      return { kind: operation, action, collection, tokenId, holder, detail };
    }
    const collection = requiredAddress(field(data, "collection"));
    await guard();
    await verified(collection, "Pit1155Collection");
    const entries = erc1155Transfers(field(data, "recipients"));
    if (entries.some((e) => e.recipient.toLowerCase() === account!.toLowerCase())) throw Error("Sender cannot be a recipient in an atomic batch.");
    const totals = new Map<bigint, bigint>();
    for (const row of entries) totals.set(row.id, (totals.get(row.id) ?? 0n) + row.amount);
    for (const [id, amount] of totals) if (await read(collection, collectionAbi, "balanceOf", [account!, id]) < amount) throw Error(`Insufficient balance for token ID ${id}.`);
    const helper = field(data, "helper") ? requiredAddress(field(data, "helper")) : undefined;
    if (helper) await verified(helper, "Pit1155BatchSender");
    return { kind: operation, collection, entries, helper, detail: `${entries.length} transfers, ${totals.size} token IDs. ${helper ? `Reviewed helper ${helper}.` : "A new reviewed helper will be deployed."} Approval scope: ALL IDs of collection ${collection} for this helper. Wallet confirmations for deployment if needed, collection-wide approval if needed, then atomic batch; revocation available separately in ERC-1155 Manager.` };
  }
  function actionTx(p: any): { to: Address; data: Hex } {
    if (p.kind === "nft-manager") {
      const functionName = p.action === "revoke" || p.action === "approve" ? "approve" : p.action === "transfer" ? "safeTransferFrom" : "mint";
      const args = p.action === "mint" ? [p.target, p.mintUri] : p.action === "transfer" ? [account, p.target, p.tokenId] : [p.action === "revoke" ? "0x0000000000000000000000000000000000000000" : p.target, p.tokenId];
      return { to: p.collection, data: encodeFunctionData({ abi: nftAbi, functionName, args }) };
    }
    if (p.kind === "erc1155-manager") {
      const functionName = p.action === "define" ? "defineToken" : p.action === "mint" ? "mint" : p.action === "burn" ? "burn" : p.action === "transfer" ? "safeTransferFrom" : "setApprovalForAll";
      const args = p.action === "define" ? [p.tokenId, p.newCap, p.amount, p.target]
        : p.action === "mint" ? [p.target, p.tokenId, p.amount]
        : p.action === "burn" ? [account, p.tokenId, p.amount]
          : p.action === "transfer" ? [account, p.target, p.tokenId, p.amount, "0x"] : [p.target, p.action === "approve"];
      return { to: p.collection, data: encodeFunctionData({ abi: collectionAbi, functionName, args }) };
    }
    throw Error("No single contract action to simulate.");
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); clear();
    try { prepared = await review(new FormData(form)); simulate.disabled = false; if (metadataButton && prepared.uri) metadataButton.hidden = false; set("Reviewed", prepared.detail); }
    catch (error) { set("Invalid or unavailable", String(error), true); }
  });
  simulate.addEventListener("click", async () => {
    if (!prepared || busy) return;
    try {
      busy = true;
      const p = prepared;
      if (p.kind === "metadata-studio") {
        if (p.mode === "json") offer(`${JSON.stringify(p.item, null, 2)}\n`, "metadata.json");
        else offer(metadataTar(p.items), "pit-nft-metadata.tar", "application/x-tar");
        set("Ready to download", p.detail);
      } else if (p.kind === "airdrop-composer") {
        const files = p.allocation.batches.map((batch: any[], index: number) => ({ filename: `batch-${String(index + 1).padStart(3, "0")}.csv`, body: `address,amount\n${batch.map((r: any) => `${r.address},${formatUnits(r.amount, p.decimals)}`).join("\n")}\n` }));
        files.push({ filename: "allocation-raw.csv", body: `address,rawUnits\n${p.allocation.allocated.map((r: any) => `${r.address},${r.amount}`).join("\n")}\n` });
        offer(filesTar(files), "pit-airdrop-batches.tar", "application/x-tar");
        set("Ready to download", `${p.detail}\nThe archive includes decimal-unit CSV files accepted by the existing ERC-20 MultiSender, plus an exact raw-unit audit CSV. No transaction was sent.`);
      } else if (p.action === "inspect") {
        set("Inspected", p.detail);
      } else if (p.kind === "erc1155-creator") {
        await guard();
        const data = encodeDeployData({ abi: collectionAbi, bytecode: contracts.Pit1155Collection.bytecode as Hex, args: [p.uri, account] });
        const gas = await client.estimateGas({ account: account!, data });
        if (gas >= (await client.getBlock()).gasLimit / 2n) throw Error("Deployment gas exceeds half the local block limit.");
        execute.disabled = false;
        set("Ready for local wallet", `${p.detail}\nCollection deployment estimate ${gas} local gas units; defining the first ID is a second transaction. PIT fee inactive.`);
      } else if (p.kind === "erc1155-multisender") {
        await guard();
        if (p.helper && await read(p.collection, erc1155, "isApprovedForAll", [account, p.helper])) {
          const ids = p.entries.map((e: any) => e.id), amounts = p.entries.map((e: any) => e.amount), recipients = p.entries.map((e: any) => e.recipient);
          await client.call({ account: account!, to: p.helper, data: encodeFunctionData({ abi: senderAbi, functionName: "send", args: [p.collection, ids, amounts, recipients] }) });
        }
        execute.disabled = false;
        set("Preflight ready", `${p.detail}\nThe final batch call is simulated again after helper deployment and approval. A new helper's final gas cannot be quoted before it exists. PIT fee inactive.`);
      } else {
        await guard();
        const tx = actionTx(p);
        await client.call({ account: account!, ...tx });
        const gas = await client.estimateGas({ account: account!, ...tx });
        execute.disabled = false;
        set("Simulated and ready", `${p.detail}\nLocal estimate ${gas} gas units; PIT fee inactive. Review the wallet prompt.`);
      }
    } catch (error) { execute.disabled = true; set("Simulation failed", String(error), true); }
    finally { busy = false; }
  });
  execute.addEventListener("click", async () => {
    if (!prepared || busy || execute.disabled) return;
    busy = true; execute.disabled = true;
    try {
      await guard();
      const p = prepared;
      if (p.kind === "erc1155-creator") {
        set("Pending", "Confirm local collection deployment in your test wallet.");
        const deployReceipt = await deploy("Pit1155Collection", [p.uri, account]);
        const collection = deployReceipt.contractAddress!;
        if ((await read(collection, collectionAbi, "owner") as Address).toLowerCase() !== account!.toLowerCase()) throw Error("Collection owner readback differs.");
        set("Pending", `Collection ${collection} deployed. Confirm definition and initial mint.`);
        const defineReceipt = await call(collection, collectionAbi, "defineToken", [p.tokenId, p.cap, p.amount, p.recipient]);
        if (await read(collection, collectionAbi, "capOf", [p.tokenId]) !== p.cap || await read(collection, collectionAbi, "balanceOf", [p.recipient, p.tokenId]) !== p.amount) throw Error("Initial ERC-1155 state readback differs.");
        set("Confirmed and verified", `Collection ${collection}; ID ${p.tokenId}; cap ${p.cap}; initial ${p.amount} to ${p.recipient}. Receipts ${deployReceipt.transactionHash}, ${defineReceipt.transactionHash}.`);
      } else if (p.kind === "erc1155-multisender") {
        const helper: Address = p.helper ?? (await deploy("Pit1155BatchSender")).contractAddress!;
        p.helper = helper;
        await verified(helper, "Pit1155BatchSender");
        let approvalHash = "existing approval";
        if (!await read(p.collection, erc1155, "isApprovedForAll", [account, helper])) {
          set("Pending approval", `Review collection-wide operator approval for ${helper}.`);
          const receipt = await call(p.collection, erc1155, "setApprovalForAll", [helper, true]);
          approvalHash = receipt.transactionHash;
          if (!await read(p.collection, erc1155, "isApprovedForAll", [account, helper])) throw Error("Operator approval readback failed.");
        }
        const before = await Promise.all(p.entries.map((e: any) => read(p.collection, erc1155, "balanceOf", [e.recipient, e.id]) as Promise<bigint>));
        const senderBefore = new Map<string, bigint>();
        for (const e of p.entries) if (!senderBefore.has(String(e.id))) senderBefore.set(String(e.id), await read(p.collection, erc1155, "balanceOf", [account, e.id]));
        const ids = p.entries.map((e: any) => e.id), amounts = p.entries.map((e: any) => e.amount), recipients = p.entries.map((e: any) => e.recipient);
        set("Pending distribution", `Confirm ${p.entries.length} atomic transfers from ${p.collection}.`);
        const receipt = await call(helper, senderAbi, "send", [p.collection, ids, amounts, recipients]);
        for (let i = 0; i < p.entries.length; i++) if (await read(p.collection, erc1155, "balanceOf", [p.entries[i].recipient, p.entries[i].id]) !== before[i] + p.entries[i].amount) throw Error(`Recipient ${i + 1} balance readback differs.`);
        for (const [id, balance] of senderBefore) if (await read(p.collection, erc1155, "balanceOf", [account, BigInt(id)]) !== balance - p.entries.filter((e: any) => String(e.id) === id).reduce((sum: bigint, e: any) => sum + e.amount, 0n)) throw Error(`Sender balance readback differs for ID ${id}.`);
        set("Confirmed and verified", `${p.entries.length} transfers, helper ${helper}, approval ${approvalHash}, batch ${receipt.transactionHash}. Collection-wide approval remains active; revoke it in ERC-1155 Manager.`);
      } else {
        const tx = actionTx(p);
        const before = p.kind === "erc1155-manager" && ["mint", "burn", "transfer"].includes(p.action) ? await read(p.collection, collectionAbi, "balanceOf", [p.action === "mint" || p.action === "transfer" ? p.target : account, p.tokenId]) as bigint : undefined;
        set("Pending", "Confirm the reviewed local transaction in your test wallet.");
        const receipt = await transact(tx.to, tx.data);
        if (p.kind === "nft-manager") {
          if (p.action === "mint" || p.action === "transfer") {
            if ((await read(p.collection, erc721, "ownerOf", [p.tokenId]) as Address).toLowerCase() !== p.target.toLowerCase()) throw Error("NFT ownership readback differs.");
          } else {
            const expected = p.action === "revoke" ? "0x0000000000000000000000000000000000000000" : p.target;
            if ((await read(p.collection, erc721, "getApproved", [p.tokenId]) as Address).toLowerCase() !== expected.toLowerCase()) throw Error("NFT approval readback differs.");
          }
        } else if (p.kind === "erc1155-manager") {
          if (p.action === "define") {
            if (!await read(p.collection, collectionAbi, "defined", [p.tokenId]) || await read(p.collection, collectionAbi, "capOf", [p.tokenId]) !== p.newCap || await read(p.collection, collectionAbi, "balanceOf", [p.target, p.tokenId]) !== p.amount) throw Error("New ID definition readback differs.");
          } else if (p.action === "approve" || p.action === "revoke") {
            if (await read(p.collection, erc1155, "isApprovedForAll", [account, p.target]) !== (p.action === "approve")) throw Error("Operator approval readback differs.");
          } else {
            const holder = p.action === "mint" || p.action === "transfer" ? p.target : account;
            const expected = p.action === "burn" ? before! - p.amount : before! + p.amount;
            if (await read(p.collection, erc1155, "balanceOf", [holder, p.tokenId]) !== expected) throw Error("ERC-1155 balance readback differs.");
          }
        }
        set("Confirmed and verified", `${p.detail}\nReceipt ${receipt.transactionHash}; block ${receipt.blockNumber}; gas used ${receipt.gasUsed}. Readback matched.`);
      }
      clear();
    } catch (error) {
      const revocation = prepared?.kind === "erc1155-multisender" && prepared.helper
        ? `\nIf you approved ${prepared.helper}, check the chain and revoke its collection-wide approval in ERC-1155 Manager before retrying.`
        : "";
      set("Failed or uncertain", `${String(error)}${revocation}`, true);
    }
    finally { busy = false; }
  });
}
