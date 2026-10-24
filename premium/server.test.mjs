import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { startPremiumLocalServer } from './server.mjs';
import { portfolioExample } from './examples.mjs';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

const clock = () => '2026-10-23T00:00:00.000Z';

test('loopback HTTP enforces fixture session, same origin, noindex and one debit per request', async () => {
  const local = await startPremiumLocalServer({ port: 0, clock });
  try {
    const page = await fetch(local.origin);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /LOCAL TEST ONLY/);
    assert.match(page.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(page.headers.get('set-cookie'),null);
    assert.equal((await fetch(`${local.origin}/api/me`)).status, 401);
    const wallet=privateKeyToAccount(`0x${'11'.repeat(32)}`);
    const issued=await fetch(`${local.origin}/api/wallet/nonce`,{method:'POST',headers:{Origin:local.origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(issued.status,200);
    const challenge=await issued.json();
    const message=createSiweMessage({domain:challenge.domain,address:wallet.address,uri:challenge.uri,version:'1',chainId:8453,nonce:challenge.nonce,issuedAt:new Date(),expirationTime:new Date(Date.now()+240000)});
    const signature=await wallet.signMessage({message});
    const login=()=>fetch(`${local.origin}/api/wallet/verify`,{method:'POST',headers:{Origin:local.origin,'Content-Type':'application/json'},body:JSON.stringify({message,signature})});
    const signed=await login();assert.equal(signed.status,200,await signed.clone().text());
    const cookie=signed.headers.get('set-cookie')?.split(';')[0];
    assert.match(cookie, /^pit_local_session=[a-f0-9]{64}$/);
    assert.match(signed.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await login()).status,401);
    const wrongHost = await new Promise((resolve, reject) => {
      const req = httpRequest(`${local.origin}/api/me`, { headers: { Host: 'example.com', Cookie: cookie } }, res => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
      req.on('error', reject); req.end();
    });
    assert.equal(wrongHost, 403);
    assert.equal((await fetch(`${local.origin}/api/report`, { method: 'POST', headers: { Cookie: cookie, Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    const headers = { Cookie: cookie, Origin: local.origin, 'Content-Type': 'application/json' };
    const request = { operationId: 'portfolio-batch-risk', requestId: 'http-once', input: portfolioExample };
    const run = () => fetch(`${local.origin}/api/report`, { method: 'POST', headers, body: JSON.stringify(request) });
    const first = await run(); assert.equal(first.status, 200);
    const firstBody = await first.json(); assert.equal(firstBody.receipt.charged, true);
    assert.equal(firstBody.entitlement.credits, 140);
    const retry = await run(); assert.equal(retry.status, 200);
    assert.equal((await retry.json()).receipt.charged, false);
    assert.equal((await (await fetch(`${local.origin}/api/me`, { headers: { Cookie: cookie } })).json()).credits, 140);
    const invalid = await fetch(`${local.origin}/api/report`, { method: 'POST', headers, body: JSON.stringify({ ...request, requestId: 'invalid', input: { ...portfolioExample, currency: 'XYZ', assets: [] } }) });
    assert.equal(invalid.status, 400);
    assert.equal((await (await fetch(`${local.origin}/api/me`, { headers: { Cookie: cookie } })).json()).credits, 140);
    for (const path of ['/api/checkout', '/api/credits', '/api/admin', '/api/stripe-webhook', '/wallet']) assert.equal((await fetch(`${local.origin}${path}`, { headers: { Cookie: cookie } })).status, 404);
    const logout=await fetch(`${local.origin}/api/wallet/logout`,{method:'POST',headers:{Cookie:cookie,Origin:local.origin,'Content-Type':'application/json'},body:'{}'});
    assert.equal(logout.status,200);
    assert.equal((await fetch(`${local.origin}/api/me`,{headers:{Cookie:cookie}})).status,401);
  } finally { await local.close(); }
});
