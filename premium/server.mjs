import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseSiweMessage } from 'viem/siwe';
import { BillingStore } from '../billing/store.mjs';
import { mockCoinGateSettlement } from '../billing/payments.mjs';
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
async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('Expected application/json.');
  const chunks = []; let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length; if (bytes > MAX_BODY) throw new Error('Request exceeds 64 KiB.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function seedFixture(store, now, userId) {
  if (store.row('SELECT 1 FROM users WHERE id=?',userId)) return;
  store.user(userId, now);
  const expiresAt = new Date(Date.parse(now) + 86_400_000).toISOString();
  for (const [kind, sku, cents] of [['pro', 'pro', 990], ['pack', 'pack5', 500]]) {
    const id=`fixture-${kind}:${userId}`;
    store.order({ id, userId, sku, expiresAt });
    const invoice=store.attachMockCryptoInvoice({orderId:id,recipient:`0x${'2'.repeat(40)}`,atomicAmount:String(cents*10000),issuedAt:now});
    mockCoinGateSettlement(store,invoice,{...invoice,eventId:`event-${id}`,transactionId:`payment-${id}`,status:'paid',priceCents:cents,currency:'EUR',confirmed:true},now);
  }
}

export async function startPremiumLocalServer({ port = 4412, clock = () => new Date().toISOString() } = {}) {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) throw new Error('Invalid local port.');
  const reports = await import('../dist-premium-local/reports.mjs');
  const {verifyPitSiwe}=await import('../dist-premium-local/siwe-policy.mjs');
  const store = new BillingStore();
  const service = new PremiumLocalService(store, [], reports);
  const nonces=new Map(), sessions=new Map();
  let origin = '';
  const server = createServer(async (req, res) => {
    try {
      if (req.socket.remoteAddress !== HOST || req.headers.host !== origin.slice(7)) { json(res, 403, { error: 'Loopback origin required.' }); return; }
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/') { send(res, 200, page, 'text/html; charset=utf-8'); return; }
      if (req.method === 'GET' && path === '/app.css') { send(res, 200, css, 'text/css; charset=utf-8'); return; }
      if (req.method === 'GET' && path === '/app.js') { send(res, 200, js, 'text/javascript; charset=utf-8'); return; }
      if (req.method === 'GET' && path === '/api/examples') { json(res, 200, { portfolio: portfolioExample, journal: journalExample }); return; }
      if (req.method === 'POST' && path === '/api/wallet/nonce') {
        if (req.headers.origin !== origin) { json(res,403,{error:'Same-origin request required.'}); return; }
        for (const [value,deadline] of nonces) if (deadline<Date.now()) nonces.delete(value);
        if (nonces.size>=100) { json(res,429,{error:'Local nonce limit reached.'}); return; }
        const nonce=randomBytes(16).toString('hex');
        nonces.set(nonce,Date.now()+300000);
        json(res,200,{nonce,chainId:8453,domain:new URL(origin).host,uri:`${origin}/`}); return;
      }
      if (req.method === 'POST' && path === '/api/wallet/verify') {
        if (req.headers.origin !== origin) { json(res,403,{error:'Same-origin request required.'}); return; }
        const signed=await body(req);
        if (typeof signed.message!=='string' || typeof signed.signature!=='string') {json(res,400,{error:'Signed message required.'});return;}
        const parsed=parseSiweMessage(signed.message),nonce=parsed.nonce;
        const deadline=nonces.get(nonce);nonces.delete(nonce);
        if (!deadline || deadline<Date.now() || !parsed.address ||
            !await verifyPitSiwe(signed.message,signed.signature,parsed.address,origin)) {json(res,401,{error:'Invalid or expired wallet sign-in.'});return;}
        const userId=`wallet:${parsed.address.toLowerCase()}`;
        seedFixture(store,clock(),userId);
        for (const [key,value] of sessions) if (value.expiresAt<Date.now()) {sessions.delete(key);service.account.tokens.delete(key);}
        if (sessions.size>=100) {json(res,429,{error:'Local session limit reached.'});return;}
        const token=randomBytes(32).toString('hex');
        sessions.set(token,{userId,address:parsed.address,expiresAt:Date.now()+86400000});
        service.account.tokens.set(token,userId);
        json(res,200,{address:parsed.address,chainId:8453},{'Set-Cookie':`pit_local_session=${token}; HttpOnly; SameSite=Strict; Path=/`});return;
      }
      const cookie = /(?:^|;\s*)pit_local_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie ?? '')?.[1];
      const session=sessions.get(cookie);
      if (!session || session.expiresAt<Date.now()) { json(res, 401, { error: 'Signed wallet session required.' }); return; }
      if (req.method === 'POST' && path === '/api/wallet/logout') {
        if (req.headers.origin!==origin) {json(res,403,{error:'Same-origin request required.'});return;}
        sessions.delete(cookie);service.account.tokens.delete(cookie);
        json(res,200,{signedOut:true},{'Set-Cookie':'pit_local_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});return;
      }
      if (req.method === 'GET' && path === '/api/wallet/identity') {json(res,200,{address:session.address,chainId:8453});return;}
      if (req.method === 'GET' && path === '/api/me') { json(res, 200, service.me(cookie, clock())); return; }
      if (req.method === 'GET' && path === '/api/history') { json(res, 200, service.history(cookie)); return; }
      if (req.method === 'POST' && path === '/api/report') {
        if (req.headers.origin !== origin) { json(res, 403, { error: 'Same-origin request required.' }); return; }
        const request = await body(req);
        const result = service.run(cookie, request, clock());
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
