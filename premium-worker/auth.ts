import { betterAuth } from 'better-auth';
import type { D1Database } from '@cloudflare/workers-types';

export interface PremiumEnv {
  DB: D1Database;
  PUBLIC_ORIGIN?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PREMIUM_REPORTS_ENABLED?: string;
}

const secret = (value: string | undefined) => typeof value === 'string' && value.length >= 32 && !/^(test|placeholder|change-me)/i.test(value);
export function authConfigured(env: PremiumEnv): boolean {
  return !!env.DB && !!env.PUBLIC_ORIGIN && /^https:\/\//.test(env.PUBLIC_ORIGIN) && secret(env.BETTER_AUTH_SECRET) && !!env.GOOGLE_CLIENT_ID && !!env.GOOGLE_CLIENT_SECRET;
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
  return betterAuth({
    database: env.DB,
    baseURL: env.PUBLIC_ORIGIN!,
    secret: env.BETTER_AUTH_SECRET!,
    trustedOrigins: [env.PUBLIC_ORIGIN!],
    emailAndPassword: { enabled: false },
    socialProviders: { google: { clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET!, disableIdTokenSignIn: true } },
    account: { encryptOAuthTokens: true, storeStateStrategy: 'database', accountLinking: { enabled: false, disableImplicitLinking: true } },
    session: { expiresIn: 60 * 60 * 24, updateAge: 60 * 60, cookieCache: { enabled: false } },
    logger: { disabled: true },
    advanced: { useSecureCookies: true, disableCSRFCheck: false, disableOriginCheck: false, crossSubDomainCookies: { enabled: false } },
  });
}
