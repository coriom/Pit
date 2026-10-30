// Offline authorization artifact check. No Cloudflare calls or deployment.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value) => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const requireFact = (condition, message) => { if (!condition) throw Error(message); };
const manifestPath = resolve(process.argv[2] || 'deployments/pit9b1-private-staging-candidate.json');
const packageRoot = resolve(process.argv[3] || 'dist-product-cloudflare-staging');
const raw = readFileSync(manifestPath);
const plan = JSON.parse(raw);
requireFact(raw.equals(Buffer.from(JSON.stringify(canonical(plan)) + '\n')), 'Manifest is not canonical JSON');
requireFact(plan.schemaVersion === 'pit-cloudflare-private-staging-v1', 'Wrong manifest version');
requireFact(plan.sourceCommit === '0411ab393dee86d10cea759ad4a3491bbdbc38e6', 'Different reviewed source');
requireFact(plan.account.id === '77dc4e907cd36ee29964c8aff47f7c38', 'Wrong Cloudflare account');
requireFact(plan.account.workersPlanRequired === 'Free' && plan.account.zeroTrustPlanRequired === 'Free'
  && plan.account.billingPrecondition.includes('halt if unverified or non-Free'), 'Free-plan gate removed');
requireFact(plan.worker.name === 'pit-v2-private-staging' && plan.worker.hostname === `${plan.worker.name}.${plan.account.workersSubdomain}.workers.dev`, 'Wrong staging hostname');
requireFact(plan.worker.workersDev === true && plan.worker.previewUrls === false && plan.worker.customRoutes.length === 0, 'Unsafe routing');
requireFact(plan.worker.postAccessWrangler.workers_dev === true && plan.worker.postAccessWrangler.preview_urls === false
  && !plan.worker.postAccessWrangler.routes && !plan.worker.postAccessWrangler.route, 'Unsafe post-Access Wrangler routing');
requireFact(sha(Buffer.from(JSON.stringify(canonical(plan.worker.postAccessWrangler)) + '\n')) === plan.worker.postAccessWranglerSha256, 'Post-Access Wrangler digest mismatch');
const access = plan.access;
requireFact(access.applicationType === 'self_hosted' && access.destination.type === 'worker'
  && access.destination.workerName === plan.worker.name && access.destination.workerIdDerivation.includes('exact named placeholder')
  && access.decision === 'allow' && JSON.stringify(access.include) === JSON.stringify([{ email: { email: 'coriolanmorel@gmail.com' } }])
  && access.exclude.length === 0 && access.require.length === 0 && access.bypassPolicies.length === 0
  && access.protectAllTraffic && access.protectStaticAssets && access.forbidHostnameSpecificOverride, 'Access guard changed');
const placeholder = readFileSync(resolve(plan.worker.denyAllWorkerPath));
const placeholderConfig = readFileSync(resolve(plan.worker.placeholderWranglerPath));
requireFact(sha(placeholder) === plan.worker.denyAllWorkerSha256 && sha(placeholderConfig) === plan.worker.placeholderWranglerSha256, 'Deny-all placeholder digest mismatch');
const placeholderWrangler = JSON.parse(placeholderConfig);
requireFact(placeholderWrangler.name === plan.worker.name && placeholderWrangler.account_id === plan.account.id
  && placeholderWrangler.main === './pit9b1-staging-deny-all.mjs' && placeholderWrangler.workers_dev === true
  && placeholderWrangler.preview_urls === false && !placeholderWrangler.assets && !placeholderWrangler.routes,
  'Placeholder could expose assets or a different route');
requireFact(placeholder.includes("status: 403") && !placeholder.includes('ASSETS'), 'Placeholder no longer denies all');
requireFact(plan.externalActionAuthorized === false, 'Manifest must not grant authorization');
const steps = plan.sequence;
requireFact(steps.findIndex((s) => s.includes('deny-all placeholder')) < steps.findIndex((s) => s.includes('attach Worker-level Access'))
  && steps.findIndex((s) => s.includes('attach Worker-level Access')) < steps.findIndex((s) => s.includes('upload only the reviewed'))
  && steps.findIndex((s) => s.includes('verify anonymous root')) < steps.findIndex((s) => s.includes('upload only the reviewed')), 'Fail-closed order changed');
const sourceManifest = readFileSync(join(packageRoot, '..', 'dist-product-staging', 'manifest.json'));
const headers = readFileSync(join(packageRoot, 'public', '_headers'));
const wrangler = readFileSync(join(packageRoot, 'wrangler.jsonc'));
requireFact(sha(sourceManifest) === plan.package.assetManifestSha256 && sha(headers) === plan.package.headersSha256
  && sha(wrangler) === plan.package.wranglerNoPublicRouteSha256, 'Reviewed package digest mismatch');
const currentConfig = JSON.parse(wrangler);
requireFact(currentConfig.workers_dev === false && currentConfig.preview_urls === false, 'Pre-Access package became public');
function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? files(join(dir, entry.name)) : [join(dir, entry.name)]); }
const assetFiles = files(join(packageRoot, 'public'));
const assetBytes = assetFiles.reduce((sum, path) => sum + statSync(path).size, 0);
requireFact(assetFiles.length === plan.package.assetCount && assetBytes === plan.package.assetBytes, 'Asset inventory changed');
requireFact(plan.package.mode === 'hosted-read-only' && plan.package.hostedSigning === false
  && plan.package.toolboxConnectSrc === 'none', 'Read-only boundary changed');
console.log(JSON.stringify({ status: 'PASS_LOCAL_CANDIDATE_ONLY', manifestSha256: sha(raw),
  assetCount: assetFiles.length, assetBytes, hostname: plan.worker.hostname, externalActionAuthorized: false }));
