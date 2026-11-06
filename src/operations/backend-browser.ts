type JobResponse = { id: string; accessToken: string; status: string };
const root = document.querySelector<HTMLElement>("[data-backend-tool]");
if (root) {
  const kind = root.dataset.backendTool!;
  const api = `${root.dataset.apiOrigin}/pit/api/v1`;
  const form = root.querySelector<HTMLFormElement>("#backend-form")!;
  const status = root.querySelector<HTMLElement>("#backend-status")!;
  const result = root.querySelector<HTMLElement>("#backend-result")!;
  const actions = root.querySelector<HTMLElement>("#backend-actions")!;
  let active: JobResponse | null = null;
  let submissionKey = crypto.randomUUID().replaceAll("-", "");
  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  form.addEventListener("input", () => { if (!submitButton.disabled) submissionKey = crypto.randomUUID().replaceAll("-", ""); });
  const setStatus = (message: string) => { status.textContent = message; };
  const headers = () => ({ Authorization: `Bearer ${active!.accessToken}` });
  const request = async (path: string, options: RequestInit = {}) => {
    const response = await fetch(`${api}${path}`, { ...options, headers: { ...headers(), ...options.headers } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.code || `HTTP ${response.status}`);
    return data;
  };
  const show = (id: string, visible: boolean) => { const element = root.querySelector<HTMLElement>(id); if (element) element.hidden = !visible; };
  const poll = async () => {
    if (!active) return;
    try {
      const data = await request(`/${kind === "monitor" ? "monitors" : "jobs"}/${active.id}`);
      setStatus(`${data.status}${data.progress?.count !== undefined ? ` · ${data.progress.count} events` : ""}`);
      if (kind === "monitor") { const alerts = await request(`/monitors/${active.id}/alerts`); result.textContent = JSON.stringify({ monitor: data, alerts: alerts.alerts }, null, 2); show("#backend-pause", data.status === "ACTIVE"); show("#backend-resume", data.status === "PAUSED"); window.setTimeout(poll, 3000); return; }
      if (["COMPLETED", "PARTIAL", "FAILED", "CANCELLED"].includes(data.status)) { result.textContent = JSON.stringify(data.result ?? { errorCode: data.errorCode }, null, 2); show("#backend-json", !!data.result); show("#backend-csv", !!data.result); show("#backend-cancel", false); return; }
      window.setTimeout(poll, 3000);
    } catch (error) { setStatus(`Unable to read result: ${String(error)}`); }
  };
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); const data = new FormData(form);
    const chain = String(data.get("chain")), contract = String(data.get("contract"));
    const input: Record<string, unknown> = { chain, contract };
    if (kind === "events" || kind === "permissions") { input.fromBlock = Number(data.get("fromBlock")); input.toBlock = Number(data.get("toBlock")); }
    if (kind === "events") { if (data.get("topic0")) input.topic0 = String(data.get("topic0")); if (data.get("abi")) { try { input.abi = JSON.parse(String(data.get("abi"))); } catch { setStatus("ABI must be valid JSON."); return; } } }
    if (kind === "distribution") { input.token = contract; delete input.contract; input.csv = String(data.get("csv")); input.transactionHashes = String(data.get("transactionHashes")).split(/\s+/).filter(Boolean); }
    if (kind === "nft") input.tokenIds = String(data.get("tokenIds")).split(/[\s,]+/).filter(Boolean);
    if (kind === "monitor") { input.startBlock = Number(data.get("startBlock")); input.rule = data.get("rule") === "transfer-threshold" ? { type: data.get("rule"), minimum: String(data.get("minimum")) } : { type: data.get("rule") }; if (data.get("email")) input.email = String(data.get("email")); }
    submitButton.disabled = true; setStatus("Submitting…"); result.textContent = "";
    try {
      const response = await fetch(`${api}/${kind === "monitor" ? "monitors" : "jobs"}`, { method: "POST", headers: { "Content-Type": "application/json", "X-PIT-Invite": String(data.get("invite")), "Idempotency-Key": submissionKey }, body: JSON.stringify(kind === "monitor" ? input : { kind, input }) });
      const created = await response.json(); if (!response.ok) throw new Error(created.code || `HTTP ${response.status}`);
      active = created; actions.hidden = false; show("#backend-cancel", kind !== "monitor"); show("#backend-delete", kind === "monitor");
      setStatus("Submitted. Save this private access token if you need to reopen the result after this tab closes.");
      const access = root.querySelector<HTMLElement>("#backend-access")!; access.hidden = false;
      root.querySelector<HTMLElement>("#backend-credentials")!.textContent = `ID: ${created.id}\nToken: ${created.accessToken}`;
      sessionStorage.setItem(`pit-backend-${kind}`, JSON.stringify(created));
      window.setTimeout(poll, 1000);
    } catch (error) { setStatus(`Submission failed: ${String(error)}. If the outcome is uncertain, retry with the unchanged form to avoid duplicate work.`); } finally { submitButton.disabled = false; }
  });
  root.querySelector<HTMLFormElement>("#backend-recover")?.addEventListener("submit", event => {
    event.preventDefault(); const recovery = new FormData(event.currentTarget as HTMLFormElement);
    active = { id: String(recovery.get("id")), accessToken: String(recovery.get("token")), status: "UNKNOWN" };
    actions.hidden = false; poll();
  });
  try { const saved = sessionStorage.getItem(`pit-backend-${kind}`); if (saved) { const parsed = JSON.parse(saved); if (parsed?.id && parsed?.accessToken) { active = parsed; actions.hidden = false; poll(); } } } catch {}
  root.querySelector("#backend-cancel")?.addEventListener("click", () => request(`/jobs/${active!.id}/cancel`, { method: "POST" }).then(poll).catch(e => setStatus(String(e))));
  for (const action of ["pause", "resume", "delete"]) root.querySelector(`#backend-${action}`)?.addEventListener("click", () => request(`/monitors/${active!.id}${action === "delete" ? "" : `/${action}`}`, { method: action === "delete" ? "DELETE" : "POST" }).then(() => { if (action === "delete") { active = null; sessionStorage.removeItem(`pit-backend-${kind}`); actions.hidden = true; root.querySelector<HTMLElement>("#backend-access")!.hidden = true; result.textContent = ""; setStatus("Monitor deleted."); } else poll(); }).catch(e => setStatus(String(e))));
  for (const format of ["json", "csv"]) root.querySelector(`#backend-${format}`)?.addEventListener("click", async () => { if (!active) return; const response = await fetch(`${api}/jobs/${active.id}/export?format=${format}`, { headers: headers() }); if (!response.ok) { setStatus("Export unavailable."); return; } const blob = await response.blob(), url = URL.createObjectURL(blob), link = document.createElement("a"); link.href = url; link.download = `pit-${kind}.${format}`; link.click(); URL.revokeObjectURL(url); });
}
