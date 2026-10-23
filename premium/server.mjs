import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { BillingStore } from '../billing/store.mjs';
import { processStripeWebhook } from '../billing/payments.mjs';
import { PremiumLocalService } from './service.mjs';
import { portfolioExample, journalExample } from './examples.mjs';
import { page } from './ui.mjs';

const HOST = '127.0.0.1';
const MAX_BODY = 65536;
const css = readFileSync(new URL('./app.css', import.meta.url));
const js = readFileSync(new URL('./app.js', import.meta.url));
const headers = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};
const send = (res, status, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(status, { ...headers, 'Content-Type': type, ...extra }); res.end(body);
};
const json = (res, status, value, extra) => send(res, status, JSON.stringify(value), 'application/json; charset=utf-8', extra);
const same = (a, b) => {
  const left = Buffer.from(a ?? ''), right = Buffer.from(b ?? '');
  return left.length === right.length && timingSafeEqual(left, right);
};
async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('Expected application/json.');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length; if (bytes > MAX_BODY) throw new Error('Request exceeds 64 KiB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function seedFixture(store, now) {
  store.user('local-fixture', now);
  const secret = `whsec_${randomBytes(24).toString('hex')}`;
  const expiresAt = new Date(Date.parse(now) + 86_400_000).toISOString();
  const periodEnd = new Date(Date.parse(now) + 30 * 86_400_000).toISOString();
  for (const [id, sku, cents] of [['fixture-pro', 'pro', 990], ['fixture-pack', 'pack5', 500]]) {
    store.order({ id, userId: 'local-fixture', sku, expiresAt });
    const event = { id: `event-${id}`, type: 'checkout.session.completed', data: { object: { id: `payment-${id}`, payment_status: 'paid', amount_total: cents, currency: 'eur', metadata: { pit_order_id: id, pit_user_id: 'local-fixture', ...(sku === 'pro' ? { pit_period_end: periodEnd } : {}) } } } };
    const raw = JSON.stringify(event), timestamp = Math.floor(Date.parse(now) / 1000);
    const signature = `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex')}`;
    processStripeWebhook(store, raw, signature, secret, now);
  }
}

export async function startPremiumLocalServer({ port = 4412, clock = () => new Date().toISOString() } = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local port.');
  const reports = await import('../dist-premium-local/reports.mjs');
  const store = new BillingStore();
  seedFixture(store, clock());
  const token = randomBytes(32).toString('hex');
  const service = new PremiumLocalService(store, [[token, 'local-fixture']], reports);
  let origin = '';
  const server = createServer(async (req, res) => {
    try {
      if (req.socket.remoteAddress !== HOST || req.headers.host !== origin.slice(7)) { json(res, 403, { error: 'Loopback origin required.' }); return; }
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/') { send(res, 200, page, 'text/html; charset=utf-8', { 'Set-Cookie': `pit_local_session=${token}; HttpOnly; SameSite=Strict; Path=/` }); return; }
      if (req.method === 'GET' && path === '/app.css') { send(res, 200, css, 'text/css; charset=utf-8'); return; }
      if (req.method === 'GET' && path === '/app.js') { send(res, 200, js, 'text/javascript; charset=utf-8'); return; }
      if (req.method === 'GET' && path === '/api/examples') { json(res, 200, { portfolio: portfolioExample, journal: journalExample }); return; }
      const cookie = /(?:^|;\s*)pit_local_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      if (!same(cookie, token)) { json(res, 401, { error: 'Local fixture session required.' }); return; }
      if (req.method === 'GET' && path === '/api/me') { json(res, 200, service.me(token, clock())); return; }
      if (req.method === 'GET' && path === '/api/history') { json(res, 200, service.history(token)); return; }
      if (req.method === 'POST' && path === '/api/report') {
        if (req.headers.origin !== origin) { json(res, 403, { error: 'Same-origin request required.' }); return; }
        const request = await body(req);
        const result = service.run(token, request, clock());
        json(res, 200, result); return;
      }
      json(res, 404, { error: 'Unknown local route.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Local request failed.';
      const status = /insufficient/.test(message) ? 402 : /collision/.test(message) ? 409 : /report_receipts|SQLITE|database/i.test(message) ? 503 : 400;
      json(res, status, { error: message });
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, HOST, resolve); });
  origin = `http://${HOST}:${server.address().port}`;
  return { origin, close: async () => { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); store.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const local = await startPremiumLocalServer();
  console.log(`PIT premium LOCAL TEST ONLY at ${local.origin}; no payment endpoints or public authentication.`);
}
