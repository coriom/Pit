// Future private-beta edge gateway. Deploy only with Worker-level Access for all
// routes, including static assets; the exact identity policy is a release input.
const enc = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, '0')).join('');
const bytes = input => Uint8Array.from(atob(input.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - input.length % 4) % 4)), x => x.charCodeAt(0));
let cachedKeys, keysUntil = 0;
async function accessKeys(team) {
  if (cachedKeys && Date.now() < keysUntil) return cachedKeys;
  const response = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`, { redirect: 'error' });
  if (!response.ok) throw Error('ACCESS_KEYS_UNAVAILABLE');
  const data = await response.json();
  if (!Array.isArray(data.keys)) throw Error('ACCESS_KEYS_INVALID');
  cachedKeys = data.keys; keysUntil = Date.now() + 5 * 60_000;
  return cachedKeys;
}
export async function verifyAccess(request, env, keySource = accessKeys) {
  if (!/^[a-z0-9-]{2,64}$/.test(env.PIT_ACCESS_TEAM ?? '') || !env.PIT_ACCESS_AUD || !env.PIT_ACCESS_ALLOWED_EMAILS) return false;
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token || token.length > 8192) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(new TextDecoder().decode(bytes(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(bytes(parts[1])));
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return false;
    const now = Math.floor(Date.now() / 1000);
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    const emails = env.PIT_ACCESS_ALLOWED_EMAILS.toLowerCase().split(',').map(x => x.trim()).filter(Boolean);
    if (claims.iss !== `https://${env.PIT_ACCESS_TEAM}.cloudflareaccess.com` || !audience.includes(env.PIT_ACCESS_AUD) ||
      typeof claims.exp !== 'number' || claims.exp <= now || (typeof claims.nbf === 'number' && claims.nbf > now) ||
      !emails.includes(String(claims.email ?? '').toLowerCase())) return false;
    const jwk = (await keySource(env.PIT_ACCESS_TEAM)).find(x => x.kid === header.kid && x.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, bytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  } catch { return false; }
}
async function limitedBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 256 * 1024) throw Error('BODY_LIMIT');
  const reader = request.body?.getReader(); if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 256 * 1024) { await reader.cancel(); throw Error('BODY_LIMIT'); } chunks.push(value); }
  const out = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; } return out;
}
export async function signOriginRequest(request, env) {
  const origin = new URL(env.PIT_BACKEND_ORIGIN);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(origin.hostname) || origin.hostname.startsWith('[') ||
      !env.PIT_EDGE_HMAC_KEY || env.PIT_EDGE_HMAC_KEY.length < 32) throw Error('EDGE_CONFIG_INVALID');
  const url = new URL(request.url), body = await limitedBody(request);
  const path = url.pathname + url.search, timestamp = String(Date.now());
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const hash = hex(await crypto.subtle.digest('SHA-256', body));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PIT_EDGE_HMAC_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = hex(await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}\n${nonce}\n${request.method}\n${path}\n${hash}`)));
  const headers = new Headers();
  for (const name of ['Content-Type','Authorization','X-PIT-Invite','Idempotency-Key','Origin']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  headers.set('X-PIT-Edge-Timestamp', timestamp); headers.set('X-PIT-Edge-Nonce', nonce); headers.set('X-PIT-Edge-Signature', signature);
  const target = new URL(path, origin);
  return new Request(target, { method: request.method, headers, body: ['GET','HEAD'].includes(request.method) ? undefined : body, redirect: 'manual' });
}
export default {
  async fetch(request, env) {
    if (!(await verifyAccess(request, env))) return new Response('Access denied', { status: 403 });
    const url = new URL(request.url);
    if (url.pathname.startsWith('/pit/api/v1/')) {
      if (!['GET','POST','DELETE','OPTIONS'].includes(request.method)) return new Response('Method not allowed', { status: 405 });
      try { return await fetch(await signOriginRequest(request, env), { redirect: 'manual' }); }
      catch { return new Response('Backend unavailable', { status: 503 }); }
    }
    if (!env.ASSETS) return new Response('Not found', { status: 404 });
    return env.ASSETS.fetch(request);
  }
};
