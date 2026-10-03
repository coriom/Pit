# Phase N — registry-driven discoverability

## Baseline and architecture

Before this phase, Astro built 11 HTML routes: the trade home, fees, legal, toolbox landing, and seven registered tool pages. Tool pages already derived visible titles and summaries from `TOOLS`, but none of the pages emitted robots, canonical, Open Graph or structured-data metadata. Fees and legal have no meta description; this phase deliberately leaves their protected content and the legal gate unchanged. The calculator and toolbox pages already contained inline local code and no referenced JS chunks.

`src/lib/tool-registry.ts` remains the source of tool identity, route, category, mode, status and summary. `TOOLBOX_PAGE` stores the landing page's identity. Each tool now has explicit, validated related-tool IDs. `toolDiscoverability` derives one title, description and factual [Schema.org WebApplication](https://schema.org/WebApplication) object from the same registry fields. The tool layout uses these values for the visible summary, HTML head, Open Graph and JSON-LD. Its “Other tools” links use relative paths so the static artifact still navigates under an IPFS CID path. This metadata neither calls nor changes execution preflight.

The sole release indexing switch is the versioned `config/discoverability.v1.json`. It is committed with `indexingEnabled=false` and `approvedOrigin=null`. There is no environment, query-string or browser-storage override. `scripts/discoverability.mjs` validates that exact schema and writes a `noindex,nofollow` tag into **all** generated HTML pages, plus `robots.txt` containing `Disallow: /`. It withholds `sitemap.xml` and canonical/`og:url` values. The script runs before CSP response-header generation and build-manifest hashing. The release guard reads the same policy and the compiled registry, then checks the final artifact. HTTP `X-Robots-Tag` is not claimed; HTML robots metadata and `robots.txt` are the controls in this static build.

| Route                      | Built title                                | Indexable now                          |
| -------------------------- | ------------------------------------------ | -------------------------------------- |
| `/`                        | PIT · Trade with clarity                   | No                                     |
| `/fees/`                   | PIT · Fee transparency                     | No                                     |
| `/legal/`                  | PIT · Legal & privacy                      | No                                     |
| `/tools/`                  | PIT Toolbox                                | No                                     |
| `/tools/swap/`             | Swap · PIT Toolbox                         | No; Ethereum Sepolia testnet execution |
| `/tools/perps/`            | Perps · PIT Toolbox                        | No; Hyperliquid testnet execution      |
| `/tools/wallet/`           | Wallet connection · PIT Toolbox            | No                                     |
| `/tools/pnl/`              | PnL Calculator · PIT Toolbox               | No                                     |
| `/tools/liquidation/`      | Liquidation Price Calculator · PIT Toolbox | No                                     |
| `/tools/impermanent-loss/` | Impermanent Loss Calculator · PIT Toolbox  | No                                     |
| `/tools/taxlot-export/`    | Taxlot export · PIT Toolbox                | No; testnet records only               |

Every registered tool route has a unique generated title and meta description, exactly one matching H1, `og:type`, `og:title` and `og:description`, and a WebApplication JSON-LD object. Execution pages retain visible `TESTNET PREVIEW` and `testnet-only` labels; their meta description and JSON-LD description explicitly end in `Testnet only.` No rating, review, usage count or public `url` is asserted. One exact built example:

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Swap",
  "description": "Review CoW order history and submit a swap on Ethereum Sepolia. Testnet only.",
  "applicationCategory": "Trade"
}
```

The current generated `robots.txt` is exactly:

```text
User-agent: *
Disallow: /
```

No `sitemap.xml` is generated. In a future separately reviewed index-enabled build, the policy must specify a single exact public HTTPS origin, with no path/query/fragment/credentials or local address. The build then emits canonical URLs for the 11 generated routes and a sitemap containing **only the seven registered tool paths**, under that same origin, and references it from `robots.txt`. Before changing the versioned policy, the operator must independently verify the dedicated origin, response headers, storage isolation, route reachability and the intended public-release/legal status. Editing a string in configuration is not itself proof of a deployed or isolated origin. Assumption 8 remains OPEN.

## Release checks and negative evidence

`scripts/release/discoverability.mjs` checks the final generated HTML and policy after `pnpm build`, before Playwright. It rejects missing/unregistered routes; duplicate/missing registry SEO identities; divergent title, description, H1, Open Graph or JSON-LD; missing execution testnet disclosure; broken related-tool links; noindex/canonical leaks; sitemap/registry divergence; and local pages that reference JS chunks, Astro islands, network APIs or wallet/protocol code. The prior Phase L CSP, SRI, secret, source-map and endpoint guard still runs independently.

`tests/unit/discoverability.test.ts` has eight cases with negative mutations covering all named release-policy guards, including indexing without approval, HTTP/path/local origins, duplicate metadata, dead sitemap URLs, wrong canonical host, absent `noindex`, fabricated canonical, missing H1/JSON-LD/disclosure, and wallet bundle or `fetch` injection into a local page. The approved-origin fixture uses `https://pit.example` **only as a test input**, not as an asserted PIT deployment. The browser suite additionally checks the built HTML identity, JSON-LD, related links, robots response and absent sitemap.

From the final local production artifact, `tools/index.html`, `tools/pnl/index.html`, `tools/liquidation/index.html` and `tools/impermanent-loss/index.html` each had **zero** `<script src>`, module-preload links, Astro islands and inline `fetch`/XHR/WebSocket references. Their referenced wallet/protocol JS chunk count is therefore zero. All four still have inline local behavior as needed. The generated static artifact has 11 HTML pages, 122 JS files and one CSS file; this phase adds no runtime dependency. The full release-check log is `release-check.txt` in this directory.

Neither a public HTTPS origin nor a live wallet transaction was verified here. Phase H-live and Phase K origin acceptance remain blocked by the previously stated external prerequisites.
