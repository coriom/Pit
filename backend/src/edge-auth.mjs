import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const digest = body => createHash('sha256').update(body).digest('hex');
export function edgeSignature(secret, timestamp, method, path, body = Buffer.alloc(0)) {
  return createHmac('sha256', secret).update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${digest(body)}`).digest('hex');
}
export function verifyEdgeRequest(req, body, secret, now = Date.now()) {
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const timestamp = req.headers['x-pit-edge-timestamp'];
  const signature = req.headers['x-pit-edge-signature'];
  if (typeof timestamp !== 'string' || !/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 60_000) return false;
  if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) return false;
  const path = new URL(req.url, 'http://localhost').pathname + new URL(req.url, 'http://localhost').search;
  const expected = Buffer.from(edgeSignature(secret, timestamp, req.method, path, body), 'hex');
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
