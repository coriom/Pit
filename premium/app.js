const $ = id => document.getElementById(id);
let examples = null, lastBundle = null, pending = null, active = 'portfolio';
const state = (message, kind = '') => { $('report-state').textContent = message; $('report-state').className = `state ${kind}`; };
async function get(path) { const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store' }); if (!response.ok) throw Error(`Local test request failed (${response.status}).`); return response.json(); }
async function refresh() {
  const [me, history] = await Promise.all([get('/api/me'), get('/api/history')]);
  $('plan').textContent = me.plan === 'pro' ? 'Pro · test fixture' : 'Free';
  $('subscription').textContent = `${me.subscription.status}; period ends ${me.subscription.periodEnd ?? 'not applicable'}`;
  $('balance').textContent = String(me.credits);
  $('history').replaceChildren(...history.map(entry => { const li = document.createElement('li'); li.textContent = `${entry.delta > 0 ? '+' : ''}${entry.delta} credits · ${entry.kind} · ${entry.created_at.slice(0, 10)}`; return li; }));
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
  document.querySelectorAll('input[name=method]').forEach(input => input.addEventListener('change', () => { $('payment-note').textContent = `${input.value.toUpperCase()} is a future test integration. No payment can be initiated here.`; }));
  try { examples = await get('/api/examples'); await refresh(); } catch (error) { state(error.message, 'error'); }
});
