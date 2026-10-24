import { betterAuth } from 'better-auth';
import { siwe } from 'better-auth/plugins';
import type { D1Database } from '@cloudflare/workers-types';
import { IDENTITY_CHAIN_ID, verifyPitSiwe } from './siwe-policy';
export { IDENTITY_CHAIN_ID, verifyPitSiwe } from './siwe-policy';

export interface PremiumEnv {
  DB: D1Database;
  PUBLIC_ORIGIN?: string;
  BETTER_AUTH_SECRET?: string;
  PREMIUM_REPORTS_ENABLED?: string;
}

const secret = (value: string | undefined) => typeof value === 'string' && value.length >= 32 && !/^(test|placeholder|change-me)/i.test(value);
export function authConfigured(env: PremiumEnv): boolean {
  if (!env.DB || !secret(env.BETTER_AUTH_SECRET)) return false;
  try { return new URL(env.PUBLIC_ORIGIN ?? '').origin === env.PUBLIC_ORIGIN && new URL(env.PUBLIC_ORIGIN).protocol === 'https:'; }
  catch { return false; }
}
export function authRequestAllowed(request: Request, env: PremiumEnv): boolean {
  if (new URL(request.url).origin !== env.PUBLIC_ORIGIN) return false;
  if (['POST','PUT','PATCH','DELETE'].includes(request.method)) {
    if (request.headers.get('Origin') !== env.PUBLIC_ORIGIN) return false;
    const site=request.headers.get('Sec-Fetch-Site');
    if (site && site!=='same-origin' && site!=='none') return false;
  }
  return true;
}

export function createAuth(env: PremiumEnv) {
  if (!authConfigured(env)) throw new Error('Authentication is not configured.');
  const origin=env.PUBLIC_ORIGIN!;
  return betterAuth({
    database: env.DB,
    baseURL: origin,
    secret: env.BETTER_AUTH_SECRET!,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: false },
    plugins: [siwe({
      domain: new URL(origin).host,
      anonymous: true,
      getNonce: async () => Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,'0')).join(''),
      verifyMessage: async ({message,signature,address}) => verifyPitSiwe(message,signature,address as `0x${string}`,origin),
    })],
    account: { accountLinking: { enabled: false, disableImplicitLinking: true } },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    logger: { disabled: true },
    advanced: { useSecureCookies: true, disableCSRFCheck: false, disableOriginCheck: false, crossSubDomainCookies: { enabled: false } },
  });
}

export async function verifiedWallet(env: PremiumEnv, userId: string): Promise<{address:string;chainId:number}|null> {
  const row=await env.DB.prepare('SELECT address,chainId FROM walletAddress WHERE userId=? AND chainId=? ORDER BY isPrimary DESC LIMIT 1').bind(userId,IDENTITY_CHAIN_ID).first<{address:string;chainId:number}>();
  return row && /^0x[\da-fA-F]{40}$/.test(row.address) ? row : null;
}

export async function limitWalletAuth(request: Request, env: PremiumEnv): Promise<boolean> {
  const ip=request.headers.get('CF-Connecting-IP');
  if (!ip || ip.length>64 || !/^[\da-fA-F:.]+$/.test(ip)) return false;
  const data=new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${ip}`);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),x=>x.toString(16).padStart(2,'0')).join('');
  const window=Math.floor(Date.now()/60_000);
  const result=await env.DB.prepare('INSERT INTO wallet_auth_rate_limits(ip_digest,window_start,attempts) VALUES (?,?,1) ON CONFLICT(ip_digest) DO UPDATE SET window_start=excluded.window_start, attempts=CASE WHEN wallet_auth_rate_limits.window_start=excluded.window_start THEN wallet_auth_rate_limits.attempts+1 ELSE 1 END WHERE wallet_auth_rate_limits.window_start<>excluded.window_start OR wallet_auth_rate_limits.attempts<20').bind(hash,window).run();
  return result.meta.changes===1;
}
