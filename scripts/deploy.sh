#!/usr/bin/env bash
set -euo pipefail
case "${1:-build}" in
  build) pnpm install --frozen-lockfile; pnpm check; pnpm test; pnpm build ;;
  cloudflare) : "${PIT_CF_PROJECT:?Set PIT_CF_PROJECT}"; test -f dist/build-manifest.json; pnpm dlx wrangler@4 pages deploy dist --project-name "$PIT_CF_PROJECT" ;;
  ipfs) command -v ipfs >/dev/null; test -f dist/build-manifest.json; ipfs add --cid-version=1 --pin=true -Qr dist ;;
  ens) printf '%s\n' 'Manual only: set your ENS resolver contenthash to ipfs://<verified CID> using your connected wallet. Verify the resolved site and keep the previous CID for rollback.' ;;
  *) printf '%s\n' 'Usage: scripts/deploy.sh build|cloudflare|ipfs|ens'; exit 2 ;;
esac
