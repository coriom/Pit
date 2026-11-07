import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const digest = body => createHash('sha256').update(body).digest('hex');
export function edgeSignature(secret, timestamp, nonce, method, path, body = Buffer.alloc(0)) {
  return createHmac('sha256', secret).update(`${timestamp}\n${nonce}\n${method.toUpperCase()}\n${path}\n${digest(body)}`).digest('hex');
}
export function verifyEdgeRequest(req, body, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const timestamp = req.headers['x-pit-edge-timestamp'];
  const nonce = req.headers['x-pit-edge-nonce'];
  const signature = req.headers['x-pit-edge-signature'];
  if (typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60_000) return false;
  if (typeof nonce !== 'string' || !/^[a-f0-9]{32}$/.test(nonce)) return false;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const path = new URL(req.url, 'http://localhost').pathname + new URL(req.url, 'http://localhost').search;
  const expected = Buffer.from(edgeSignature(secret, timestamp, nonce, req.method, path, body), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
