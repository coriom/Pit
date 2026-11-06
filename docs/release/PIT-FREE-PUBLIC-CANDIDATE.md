# PIT Crypto Free public candidate

Status: source and static packaging prepared locally. No public site has been deployed.

## Scope and build

`pnpm product:free:rc` creates `dist-pit-free-rc/`: the integrated, read-only, non-indexed source package. It contains 151 Toolbox experiences, 28 Explorer inspections and 18 informational Operations routes. The latter cannot sign, broadcast or collect fees. Toolbox keeps `connect-src 'none'` and zero JavaScript chunks; Explorer uses only explicitly initiated public RPC reads.

`PIT_FREE_PUBLIC_CONFIG=/absolute/path/to/reviewed-config.json pnpm product:free:public-candidate` creates `dist-pit-free-public-candidate/` locally. It accepts an exact HTTPS public origin and verified publisher facts. It refuses private staging hostnames, incomplete legal text, unreviewed legal content, absent domain control and absent PIT Crypto prior-rights clearance. It gives free routes canonical and Open Graph URLs plus a sitemap, while Operations previews and the 404 remain `noindex`. It never deploys. A synthetic `example.org` configuration may be used only for local tests; that artifact is not releasable.

The configuration schema is `pit.crypto-free-public-config.v2`. Required gates: `legalReviewApproved: true`, `brandRightsClearanceApproved: true`, `domainControlVerified: true`. Required facts: `origin`, `publisherName`, `publisherStatus`, `publisherAddress`, `publisherRegistration`, `publicationDirector`, `contactEmail`, `contactPhone`, `privacyEmail`, `hostingProvider`, `hostingAddress`, `hostingPhone`, `jurisdiction`, and reviewed plain-text `legalText.notice`, `.privacy`, `.terms`, `.cookies`. The operator or counsel must confirm actual identity, business contact and hosting details, wording, retention rules and legal basis before a real public build. No domain or legal identity is assumed in source. Boolean gates attest to external evidence; the build cannot itself prove trademark clearance or domain control.

Use [the fail-closed example](pit-crypto-public-config.example.json) as a field inventory. Keep the completed configuration outside Git. The example deliberately has false gates and placeholders and cannot produce an indexable build.

## Proposed hosting

Use a distinct Cloudflare Static Assets Worker, `pit-v2-free-public`, on an operator-approved HTTPS hostname. The generated Wrangler configuration has `workers_dev:false` and `preview_urls:false`; it has no route until the final hostname and deployment are separately authorized. Do not reuse or alter `pit-v2-private-staging` or its Access policy. The package is static and needs no payment backend, database, signing key, analytics or mandatory account.

The local source package currently has 231 checked source files and about 11 MiB. The synthetic finalization fixture yielded 235 files and 202 indexable routes, including the added legal pages. Recheck final file count, maximum asset size and account entitlement before deployment. Cloudflare's documented Workers Free limits are 20,000 static files per version and 25 MiB per file; static-asset requests are currently free. This does not guarantee availability, eligibility, DNS ownership or zero future cost. See <https://developers.cloudflare.com/workers/platform/limits/> and <https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/>.

## RPC reliability and privacy

Explorer uses Ethereum (`eth.drpc.org`), Base (`base.drpc.org`) and supported Base Sepolia (`sepolia.base.org`) public RPC endpoints. It verifies `eth_chainId` and never substitutes zero for an unavailable result. A normal inspection permits at most 20 RPC calls with a 10-second per-call timeout and 64 KiB response cap. Batch balances permit up to 25 addresses, eight asset classes per address and 200 explicit balance reads, with at most four concurrent requests, a 30-second deadline and 420 attempts including retries. Rate limits and unsupported token calls yield explicit unavailable results where partial output is safe. Repeated user requests cannot be globally rate limited from a static browser package; provider-side quotas may change without notice. RPC providers can observe queried addresses and IP/network metadata.

Before publication, test `eth_chainId`, browser CORS preflight, an actual read, rate limiting and error handling from the approved public origin. A short read-only preflight from the development environment is not a sustained availability or quota guarantee. Do not add a paid RPC dependency without a separate decision.

## Publication sequence and rollback

1. Obtain a domain/hostname owned or controlled by the operator and confirm DNS, TLS, and Cloudflare Free entitlement.
2. Complete and professionally review the legal configuration; build and inspect the final package, sitemap, canonical links, headers, route inventory, secret scan and asset hashes.
3. Request a separate, hash-bound public-hosting authorization. GitHub source integration is not publication authorization.
4. Create only the distinct public Worker/route under that authorization; verify the private staging Worker and Access policy are unchanged.
5. Check desktop/mobile routes, free reads, CORS, 404, robots, headers and absence of signing on the actual hostname.
6. If an unexpected public write path, wrong origin, broken legal notice or privacy leak appears, remove the public route or roll back the Worker version. Leave private staging untouched.

Public release remains blocked until the real domain, verified publisher details, final legal review, deployment authorization and hosted acceptance are available. Manual MetaMask acceptance is irrelevant to the independent Free layer and remains deferred for paid Operations.
