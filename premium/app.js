const $ = id => document.getElementById(id);
let examples = null, lastBundle = null, pending = null, active = 'portfolio', signedAddress = null;
const state = (message, kind = '') => { $('report-state').textContent = message; $('report-state').className = `state ${kind}`; };
async function get(path) { const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw Error(`Local test request failed (${response.status}).`); return response.json(); }
async function refresh() {
  let identity;
  try { identity=await get('/api/wallet/identity'); } catch {
    signedAddress=null;
    $('wallet-address').textContent='Not signed in';
    $('plan').textContent='Free';
    $('subscription').textContent='No premium session';
    $('balance').textContent='—';
    $('history').replaceChildren();
    $('wallet-signin').hidden=false; $('wallet-signout').hidden=true;
    for (const id of ['portfolio-run','journal-run']) $(id).disabled=true;
    return;
  }
  signedAddress=identity.address;
  $('wallet-address').textContent=`${identity.address.slice(0,6)}…${identity.address.slice(-4)} · Base`;
  $('wallet-signin').hidden=true; $('wallet-signout').hidden=false;
  for (const id of ['portfolio-run','journal-run']) $(id).disabled=false;
  const [me, history] = await Promise.all([get('/api/me'), get('/api/history')]);
  $('plan').textContent = me.plan === 'pro' ? 'Pro · fictional credits' : 'Free';
  $('subscription').textContent = `${me.subscription.status}; period ends ${me.subscription.periodEnd ?? 'not applicable'}`;
  $('balance').textContent = String(me.credits);
  $('history').replaceChildren(...history.map(entry => { const li = document.createElement('li'); li.textContent = `${entry.delta > 0 ? '+' : ''}${entry.delta} credits · ${entry.kind} · ${entry.created_at.slice(0, 10)}`; return li; }));
}
async function signInWallet() {
  if (!window.ethereum?.request) {state('Install or open an EVM wallet to try local sign-in. No transaction is needed.','error');return;}
  try {
    const accounts=await window.ethereum.request({method:'eth_requestAccounts'});
    const address=accounts?.[0];
    if (!/^0x[\da-fA-F]{40}$/.test(address??'')) throw Error('Wallet address unavailable.');
    const chain=await window.ethereum.request({method:'eth_chainId'});
    if (Number.parseInt(chain,16)!==8453) throw Error('Switch the wallet to Base before signing in.');
    const nonceResponse=await fetch('/api/wallet/nonce',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:'{}'});
    if (!nonceResponse.ok) throw Error('Could not issue a sign-in nonce.');
    const {nonce,domain,uri}=await nonceResponse.json();
    const issued=new Date(),expiry=new Date(issued.getTime()+240000);
    const message=`${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to PIT premium local test.\n\nURI: ${uri}\nVersion: 1\nChain ID: 8453\nNonce: ${nonce}\nIssued At: ${issued.toISOString()}\nExpiration Time: ${expiry.toISOString()}`;
    const signature=await window.ethereum.request({method:'personal_sign',params:[message,address]});
    const verified=await fetch('/api/wallet/verify',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({message,signature})});
    if (!verified.ok) throw Error('Wallet signature was not accepted.');
    await refresh();
    state('Signed in with your wallet. Fictional test credits are available; no payment was made.','success');
  } catch(error) {state(error.message??'Wallet sign-in failed.','error');}
}
function showTab(which) {
  active = which;
  for (const name of ['portfolio', 'journal']) {
    const selected = name === which;
    $(`tab-${name}`).setAttribute('aria-selected', String(selected));
    $(`tab-${name}`).tabIndex = selected ? 0 : -1;
    $(`panel-${name}`).hidden = !selected;
  }
  $(`tab-${which}`).focus();
  preview();
}
function inputFor(which) {
  if (which === 'portfolio') return JSON.parse($('portfolio-input').value);
  return { currency: $('journal-currency').value.trim().toUpperCase(), startingCapital: $('journal-capital').value.trim(), tradesCsv: $('journal-input').value };
}
function preview() {
  if (active === 'portfolio') {
    const source = $('portfolio-input').value;
    if (!source.trim()) { $('input-preview').textContent = 'No portfolio input loaded. Review what you enter before using credits.'; return; }
    try {
      const value = JSON.parse(source);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('object required');
      $('input-preview').textContent = `Input preview: ${Array.isArray(value.assets) ? value.assets.length : '?'} named holdings, ${Array.isArray(value.dates) ? value.dates.length : '?'} return dates, ${Array.isArray(value.snapshots) ? value.snapshots.length : 'no'} historical snapshots; currency ${value.currency ?? 'not supplied'}. Server validation occurs before any debit.`;
    } catch { $('input-preview').textContent = 'Input preview: portfolio JSON is malformed; no credit will be used.'; }
    return;
  }
  const size = new TextEncoder().encode($('journal-input').value).length;
  $('input-preview').textContent = `Input preview: ${size} UTF-8 CSV bytes; manual currency ${$('journal-currency').value || 'not supplied'}; starting capital ${$('journal-capital').value || 'not supplied'}. Server validation checks actual CSV records before any debit.`;
}
async function run(which) {
  if (!signedAddress) {state('Sign in with your wallet before running a premium report.','error');return;}
  const operationId = which === 'portfolio' ? 'portfolio-batch-risk' : 'trading-journal-advanced';
  let input;
  try { input = inputFor(which); } catch { state('Enter valid JSON or load the fictional example.', 'error'); return; }
  const signature = JSON.stringify([operationId, input]);
  if (!pending || pending.signature !== signature) pending = { signature, requestId: crypto.randomUUID() };
  const button = $(`${which}-run`);
  button.disabled = true; state('Validating and generating your report…'); $('result').hidden = true;
  try {
    const response = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ operationId, requestId: pending.requestId, input }) });
    const data = await response.json();
    if (!response.ok) throw Error(data.error ?? `Report failed (${response.status}).`);
    lastBundle = data;
    $('result-title').textContent = which === 'portfolio' ? 'Portfolio batch risk' : 'Trading journal advanced';
    const summary = which === 'portfolio' ? `Stress change: ${data.report.stress.change} ${data.report.currency}; annualized sample volatility: ${data.report.risk.annualizedVolatilityPct}%.` : `Net PnL: ${data.report.summary.netPnl} ${data.report.currency}; maximum modeled drawdown: ${data.report.summary.maximumDrawdownPct}%.`;
    $('result-summary').textContent = summary;
    $('result-details').textContent = JSON.stringify(data.report, null, 2);
    $('result').hidden = false;
    state(`${data.receipt.charged ? '10 credits used' : 'Exact retry: no new credits used'}. Balance: ${data.entitlement.credits}.`, 'success');
    await refresh();
  } catch (error) { state(error.message, 'error'); } finally { button.disabled = false; }
}
function download(kind) {
  if (!lastBundle) return;
  const content = kind === 'json' ? JSON.stringify({ report: lastBundle.report, receipt: lastBundle.receipt }, null, 2) : lastBundle.csv;
  const blob = new Blob([content], { type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = `pit-${lastBundle.report.operation}-local.${kind}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
document.addEventListener('DOMContentLoaded', async () => {
  $('wallet-signin').addEventListener('click',signInWallet);
  $('wallet-signout').addEventListener('click',async()=>{await fetch('/api/wallet/logout',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:'{}'});await refresh();state('Signed out.');});
  window.ethereum?.on?.('accountsChanged',async()=>{
    signedAddress=null;
    await fetch('/api/wallet/logout',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:'{}'}).catch(()=>{});
    await refresh();
    state('Wallet changed. Sign in again before using credits.');
  });
  $('tab-portfolio').addEventListener('click', () => showTab('portfolio'));
  $('tab-journal').addEventListener('click', () => showTab('journal'));
  $('tab-portfolio').addEventListener('keydown', event => { if (event.key === 'ArrowRight') showTab('journal'); });
  $('tab-journal').addEventListener('keydown', event => { if (event.key === 'ArrowLeft') showTab('portfolio'); });
  $('portfolio-example').addEventListener('click', () => { $('portfolio-input').value = JSON.stringify(examples.portfolio, null, 2); preview(); state('Fictional portfolio example loaded. Review its assumptions before generating.'); });
  $('journal-example').addEventListener('click', () => { $('journal-currency').value = examples.journal.currency; $('journal-capital').value = examples.journal.startingCapital; $('journal-input').value = examples.journal.tradesCsv; preview(); state('Fictional journal example loaded. Review its assumptions before generating.'); });
  for (const id of ['portfolio-input', 'journal-input', 'journal-currency', 'journal-capital']) $(id).addEventListener('input', preview);
  $('portfolio-run').addEventListener('click', () => run('portfolio'));
  $('journal-run').addEventListener('click', () => run('journal'));
  $('json-download').addEventListener('click', () => download('json'));
  $('csv-download').addEventListener('click', () => download('csv'));
  $('pack').addEventListener('change',()=>{ $('payment-note').textContent='Base native USDC purchase is a future option. The payout address and settlement service are not approved; no payment can be initiated here.'; });
  try { examples = await get('/api/examples'); await refresh(); } catch (error) { state(error.message, 'error'); }
});
