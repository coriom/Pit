# PIT Free — publication preflight (2026-11-04)

Status: **source candidate prepared; public publication blocked; no public deployment or DNS change**. This record concerns PIT Free only. Paid execution and the private staging Worker remain separate.

## Evidence checked

- GitHub `main` at the start: `90d3576bb9d2b1676457cb5e092f5e87be44d477`.
- `pnpm product:free:rc` produced a local, non-indexed package: 151 Toolbox experiences, 28 Explorer inspections, 18 informational Operations routes, 196 distinct tasks. The checked staging source manifest contains 231 assets; the local Free RC directory contains 232 files including its generated `_headers`. Source manifest SHA-256: `63f0d55611566f594292bd602e65f245b5267d1522bb95d5d7bb72ff055aa6ef`.
- The local package has no public origin or sitemap, no wallet signing or payment collection, no private staging hostname in HTML/JS/JSON/CSS, and zero Toolbox JavaScript chunks. Its `_headers` retains Toolbox `connect-src 'none'` and private `noindex` until finalization.
- Cloudflare token file is mode `0600`; token verification and account/zone/Worker inventory GETs succeeded. Account: `77dc4e907cd36ee29964c8aff47f7c38`, Workers subdomain `coriolanmorel`. There are **zero zones** in this account. Existing Workers are `pit-premium-cb-sandbox` and `pit-v2-private-staging`; `pit-v2-free-public` does not exist. The subscription GET returned 403, so the plan cannot be independently confirmed through this token. The operator previously confirmed Workers Free and Zero Trust Free; reconfirm entitlement before deployment.
- The local 2025 creation summary recorded an EI/micro-enterprise identity. A read-only 2026-11-04 query to the public French company-search API returned the matching SIREN as administratively active and activity code `96.09Z`, but the name is **non-diffusible** through that API. The current public publisher address and a verified public contact are absent from the local business configuration; legal review is false. Historic private domiciliation details must not be copied into PIT.

## Hostname and hosting

Prefer a branded, operator-controlled HTTPS hostname in an active Cloudflare zone. None is currently available in this account. A zone must be added and its ownership/DNS decided separately; do not infer ownership from a domain mentioned in documents. Cloudflare recommends a custom domain or route for production rather than `workers.dev`. The account subdomain could support a temporary `pit-v2-free-public.coriolanmorel.workers.dev` route **only if the operator expressly chooses that public hostname**; no such route is active or approved.

The distinct static-assets Worker stays named `pit-v2-free-public`. The current candidate's `wrangler.jsonc` sets `workers_dev:false`, `preview_urls:false` and has no route. The checked package has 232 files, about 10.1 MB total and a largest file of about 0.22 MB, below Cloudflare's documented Workers Free static limits of 20,000 files per version and 25 MiB per file. Static asset requests are currently free. Expected fixed hosting cost is **0 €/month only if the account remains eligible for Workers Free and no paid domain or service is added**; the token cannot read billing status. References: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [static asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

## Legal gate

The final public configuration requires verified current publisher identity/status, a legally usable public address, registration details, working public and privacy contacts, hosting-provider notice, and reviewed text for legal notice, privacy, terms and cookies. The existing local template in `docs/legal/PIT-FREE-PUBLIC-LEGAL-TEMPLATE.md` is a draft. The 2025 summary and current active-SIREN lookup do not establish the current declared software/Web3 activity or settle publication wording. A professional review must resolve that point and the privacy/hosting disclosures. No actual publisher facts or private business configuration are committed here.

## Finalization and rollback

1. Select a controlled public hostname; verify its Cloudflare zone, DNS and TLS. Confirm current account entitlement.
2. Confirm the public publisher address and contact, current registered activity and final legal notices; keep the reviewed JSON configuration untracked and private. Set `legalReviewApproved:true` only after review.
3. Run `pnpm product:free:rc`, then `PIT_FREE_PUBLIC_CONFIG=/absolute/path/to/reviewed-config.json pnpm product:free:public-candidate`. Check source commit, all asset and legal-page hashes, canonical links, sitemap, robots, headers, security boundaries, route inventory and absence of secrets/private hostnames. Build a canonical publication manifest binding these values, the Cloudflare account, exact Worker route, cost and rollback. **Only then** calculate its SHA-256 and request `GO PIT FREE PUBLIC <manifest-sha256>`.
4. After a matching approval, deploy only the distinct public Worker. Smoke-test homepage, deep links, legal pages, 404, SEO, TLS, mobile navigation, public RPC reads, CSP, and absence of wallet/payment code from the actual hostname. Leave `pit-v2-private-staging` and its Access policy untouched.
5. If wrong content, legal identity, security headers or execution capability appears, remove the public route or roll the public Worker back to its previous reviewed version. Never route traffic through the private staging or SIWE Worker.

**No final publication manifest or deployment authorization digest exists yet.** A guessed hostname or historic private address would make that digest misleading.

Phase 10D adds a [five-name .fr comparison](PIT-FREE-DOMAIN-REVIEW.md) and [four reviewable Free legal drafts](../legal/PIT-FREE-PUBLIC-DRAFTS.md). The names are not owned, and an existing French software business uses the PIT name; domain availability alone does not clear name rights.
