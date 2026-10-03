# Phase S — CLI quote transport

## Status and scope

The source baseline was `e774c34b9e4e1375965618c540019fc9e8d2a5ea`; `git status --short` printed nothing. `src/lib/config.ts` had `FEES_ENABLED: false` and `MAINNET_ENABLED: false` before edits and remains unchanged. Ethereum Sepolia `11155111`, `https://ethereum-sepolia-rpc.publicnode.com`, the CoW Sepolia API, the WETH/test-USDC pair, both fixed amounts and the synthetic diagnostic `from` are unchanged. No wallet or live execution was used. Assumption 8 remains OPEN.

```text
$ git rev-parse HEAD
e774c34b9e4e1375965618c540019fc9e8d2a5ea
$ git status --short
$ node --version
v22.22.3
$ pnpm --version
10.17.1
$ node -p "require('viem/package.json').version"
2.57.0
$ node -e 'const v=process.versions; console.log(JSON.stringify({node:v.node,undici:v.undici??null,openssl:v.openssl}))'
{"node":"22.22.3","undici":"6.24.1","openssl":"3.5.6"}
```

The [Phase Q failure](../phase-q/cli-probe-output.txt) was `fetch failed` at `eth_chainId`. The Phase Q [browser capture](../phase-q/browser-live-read.json) separately showed a same-input comparison on the built localhost page. It does not establish CLI reliability, public-origin acceptance or execution. The changed code contains no credential material. The tracked-file release guard was retained; current authored-file/history pattern scanning reports many **pre-existing** public-hash candidates in historical audit artifacts, so its aggregate candidate count is not a claim of credential absence. A targeted scan of the Phase S changes identified one inert test-word false positive, which was removed. The clean-source release guard scanned the committed source before the evidence-only amendment. A separate post-amendment scan of `docs/VERIFICATION.md` and all Phase S evidence returned zero private-key PEM, provider-token, credential-URL userinfo, credential-query and credential-assignment matches; public block/build hashes are not classified as credentials by that result. No credential candidate was copied into the evidence.

Proxy/custom-CA/runtime-option **presence only**, without values: `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `NODE_USE_ENV_PROXY`, and `NODE_TLS_REJECT_UNAUTHORIZED` were all absent from the probe process environment. This does not prove the absence of network policy outside the process.

## Baseline and diagnostic matrix

`pnpm quotes:probe` was run once before editing. [Complete stdout](baseline-probe.stdout.txt), [empty stderr](baseline-probe.stderr.txt), and [UTC duration/exit metadata](baseline-probe.meta.json) are preserved. It started `2026-10-03T09:58:40.690Z`, ended `09:58:45.578Z` (4,886 ms), and exited **2**. CoW returned a verified diagnostic quote for `0.01` WETH with output `442316397` test-USDC base units and PIT fee `0`; Uniswap was unavailable because the metadata block read failed. Exact failing line:

```text
HTTP request failed.
URL: https://ethereum-sepolia-rpc.publicnode.com/
Request body: {"method":"eth_getBlockByNumber","params":["latest",false]}
Details: fetch failed
Version: viem@2.57.0
```

The pre-edit error had no serialized nested cause. It proves neither DNS failure nor a specific RPC-side rejection. The diagnostic matrix used the **same** approved URL, POST `{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}`, no credentials, one request per layer, zero retry, 8,000 ms deadline. The following is the exact sanitized console result of the minimal Node `fetch`/viem calls; viem's high-level API does not expose HTTP status/headers on success:

```sh
node --input-type=module <<'EOF'
import { createPublicClient, http } from 'viem';
import { sepolia } from 'viem/chains';
const url='https://ethereum-sepolia-rpc.publicnode.com';
const body={jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]};
function err(e){const a=[];for(let i=0;e&&i<5;i++,e=e.cause)a.push({name:e.name,code:e.code??null,message:String(e.message??'').slice(0,400)});return a}
const output={utc:new Date().toISOString(),endpoint:url,request:{method:'POST',body},layers:[]};
for(const kind of ['node-fetch','viem']){
  const t=performance.now();let row={kind,timeoutMs:8000,retryCount:0};
  try{
    if(kind==='node-fetch'){
      const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      row.status=res.status;row.headers={contentType:res.headers.get('content-type'),retryAfter:res.headers.get('retry-after')};row.response=await res.json();
    }else{
      const client=createPublicClient({chain:sepolia,transport:http(url,{timeout:8000,retryCount:0})});row.result=await client.getChainId();
    }
  }catch(e){row.errors=err(e)}
  row.elapsedMs=Math.round(performance.now()-t);output.layers.push(row);
}
console.log(JSON.stringify(output,null,2));
EOF
```

```json
{
  "utc": "2026-10-03T10:01:07.305Z",
  "endpoint": "https://ethereum-sepolia-rpc.publicnode.com",
  "request": {"method":"POST","body":{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}},
  "layers": [
    {"kind":"node-fetch","timeoutMs":8000,"retryCount":0,"status":200,"headers":{"contentType":"application/json","retryAfter":null},"response":{"jsonrpc":"2.0","result":"0xaa36a7","id":1},"elapsedMs":1186},
    {"kind":"viem","timeoutMs":8000,"retryCount":0,"result":11155111,"elapsedMs":1001}
  ]
}
```

One additional minimal viem POST `eth_getBlockByNumber(["latest",false])` at `2026-10-03T10:01:27.925Z` succeeded in 1,894 ms at block `11835060`, public block hash `public-hash:2d27f056e0060a69e4ed4474071703d9:6cb5b3a4229158d1dab598ab60535e23` (join the two halves and prefix `0x`). The existing full PIT path was the baseline above. Node's global `fetch` is implemented by bundled Undici in this runtime ([Node fetch API](https://nodejs.org/docs/latest-v22.x/api/globals.html#fetch)); Node documents nested `cause` and system error codes ([Node errors](https://nodejs.org/docs/latest-v22.x/api/errors.html)). The installed viem 2.57.0 `http` transport passes `fetchFn` to `getHttpRpcClient`, whose default is global `fetch`, and its `createTransport` defaults to three retries unless explicitly set; see installed `viem/_esm/clients/transports/http.js`, `viem/_esm/utils/rpc/http.js`, and `viem/_esm/utils/buildRequest.js`.

**Established:** the failure is intermittent at Node/viem HTTP transport: the original full probe failed at a block read, the minimal matrix succeeded, and a later full probe timed out at chain ID. **Unresolved:** whether DNS, connection setup, TLS, upstream policy, or another external layer caused the first `fetch failed`. There was no HTTP rejection, JSON-RPC error, wrong-chain response, or malformed JSON in the failing runs. CORS, token liquidity and wallet funding are not supported explanations for a Node transport error.

## Narrow correction and bounded live read

The Node-only probe now injects one request-scoped `fetchFn` into **both** existing viem read clients. Browser defaults are unchanged. It fixes the previously inconsistent CLI transport setup: metadata had zero retries while Uniswap's default viem client could retry three times. Both CLI clients now set viem `retryCount:0`; the wrapper permits at most one retry only for a recognized transient network/timeout cause or HTTP 408/429/5xx, honors `Retry-After`, and keeps an 8-second per-request budget with 3.5-second attempt deadlines. It does not retry JSON-RPC errors, malformed replies, a wrong chain, aborted requests, or unsupported markets. It checks that requests stay on the configured HTTPS RPC URL; it does not change the network allowlist or global fetch/dispatcher. The diagnostic JSON now includes nested **error names/codes only**, never nested messages that might contain credentials. Its exit contract remains `0` complete comparison, `2` blocked comparison, `3` configuration/read failure.

The sole post-change full probe [stdout](post-probe.stdout.txt), [stderr](post-probe.stderr.txt), [metadata](post-probe.meta.json) ran `2026-10-03T10:06:13.558Z`–`10:06:24.979Z` (11,421 ms), **exit 2**. Its CoW verified quote survived; Uniswap's chain-ID read still timed out. The nested cause was `HttpRequestError -> TimeoutError (code 23)`, an abort at the probe’s local attempt deadline; it is not evidence that the RPC server itself timed out. The one allowed confirmation [stdout](confirm-probe.stdout.txt), [stderr](confirm-probe.stderr.txt), [metadata](confirm-probe.meta.json) ran `2026-10-03T10:06:40.673Z`–`10:06:48.076Z` (7,403 ms), **exit 0**. It returned `COMPARISON_OK` at Sepolia block `11835085`: WETH `0.01` total debit, CoW output `441891935` test-USDC base units with embedded solver network cost `271584650878785` WETH base units and PIT fee `0`; Uniswap selected the single tier-500 pool and returned `566804400` test-USDC base units with quoter-internal gas `123373`, **not** a wallet transaction estimate. Separately paid gas remains unknown. Both outputs are point-in-time diagnostic quotes, neither an executable authorization; no off-chain CoW block equivalence is claimed. The confirmation proves current CLI live-read comparison can succeed, not that the intermittent transport fault is eliminated.

The linked stdout files preserve all lines, with one documented reversible public-field representation: values of exactly 32 bytes in the JSON fields `hash`, `codeKeccak256`, and `appData` are written as `public-hash:<first 32 hex digits>:<last 32 hex digits>`; join the halves and prefix `0x` to recover their original values (`codeKeccak256` originally used `hex:`). No other field is transformed. The exact raw byte streams from this session are `/tmp/pit-s-{baseline,post,confirm}.stdout` and `.stderr`; the `.meta.json` files record command timing and true exit status. The transformation keeps public block/code hashes and zero appData distinct from unreviewed secret-shaped strings in committed evidence.

## Regression and remaining limits

`pnpm vitest run tests/quote-probe-runtime.test.ts tests/diagnostic-quotes.test.ts` passed **7 tests in 2 files** after the change; [exact output](targeted-tests.txt). The new deterministic tests cover Sepolia/wrong-chain, HTTP-200 JSON-RPC error, malformed response, one transient retry, two-failure cap, Retry-After beyond budget, abort without retry, credential-free nested cause codes, provider failure isolation, and nonzero incomplete-comparison exit. The wrong-chain integration test proves zero CoW/Uniswap calls. Existing diagnostic tests reject approval and submission of diagnostic quotes and their forged executable labels. The CLI call graph contains only public RPC `eth_chainId`, block/code/read-contract/`eth_call` and CoW `getQuote`; it imports no wallet provider, execution recorder, Taxlot or derivative store. Thus no account-access, approval, signing, submission or accounting-write operation was invoked. No transaction was executed.

The exact clean-source `pnpm release:check` transcript and tested commit/artifact hash are appended below after the source is committed. Network-dependent `quotes:probe` remains outside deterministic release checks. Phase H live operator trades, Phase K dedicated HTTPS origin and actual headers, legal mainnet fee gate, and upstream derivative accounting compatibility remain outstanding; this CLI result does not make them prerequisites for each other or close Assumption 8.

## Clean committed-source release output

`pnpm release:check` passed against clean source commit `3ff924c55ffffaeb2d17118446b8fa3a12903a5a`. Its [complete 360-line output](release-check.txt) records **148 unit tests in 21 files**, **24 Playwright tests**, **90 typechecked files with zero errors/warnings/hints**, **11 static pages**, the artifact/CSP/SRI/secret/origin/indexing guards, and production build SHA-256 `ab84ad5f731420735b2130194f2ae8b0955668c8f3cdc318802bee6514b3b6ba`. The first sandboxed attempt exited 1 with `RELEASE CHECK FAILED: spawnSync git EPERM`; the rerun with Git read access passed. Only `CLI-TRANSPORT.md`, `docs/VERIFICATION.md`, `release-check.txt`, and the trailing blank line in `targeted-tests.txt` change in the final evidence-only amendment. Every non-evidence tracked file remains identical to the tested commit; the exact `git diff --name-only` comparison is recorded at finalization.
