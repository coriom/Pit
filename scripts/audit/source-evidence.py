from pathlib import Path
import subprocess
print('$ rg -n FEES_ENABLED src tests scripts README.md ASSUMPTIONS.md .env.example')
subprocess.run(['rg','-n','FEES_ENABLED','src','tests','scripts','README.md','ASSUMPTIONS.md','.env.example'])
files=['src/lib/config.ts','src/lib/cow.ts','src/lib/hyperliquid.ts','src/lib/events.ts','src/lib/record-fills.ts','src/components/Swap.tsx','src/components/Perps.tsx','src/components/Wallet.tsx','src/components/FillRecorder.tsx','scripts/generate-validator.mjs','docs/DEPLOY.md','astro.config.mjs','public/_headers']
for name in files:
 print('\n$ numbered source: '+name)
 for n,line in enumerate(Path(name).read_text().splitlines(),1):print(f'{n}: {line}')
segments={
 '@cowprotocol+sdk-trading@*/node_modules/@cowprotocol/sdk-trading/dist/index.mjs':[(66,128),(183,192),(236,241),(343,412),(787,825),(882,909),(1127,1160)],
 '@cowprotocol+sdk-order-book@*/node_modules/@cowprotocol/sdk-order-book/dist/index.mjs':[(130,139),(456,481)],
}
for pattern,ranges in segments.items():
 p=next(Path('node_modules/.pnpm').glob(pattern));lines=p.read_text().splitlines()
 for start,end in ranges:
  print(f'\n$ numbered SDK source: {p}:{start}-{end}')
  for n in range(start,end+1):print(f'{n}: {lines[n-1]}')
for name,ranges in {
 'node_modules/@nktkas/hyperliquid/esm/api/exchange/_methods/approveBuilderFee.js':[(8,23),(49,71),(108,116)],
 'node_modules/@nktkas/hyperliquid/esm/signing/_userSigned.js':[(75,90)],
 'node_modules/@nktkas/hyperliquid/esm/transport/http/mod.js':[(29,32),(95,100),(133,144)],
 **{f'node_modules/viem/_esm/chains/definitions/{chain}.js':[(1,18)] for chain in ['mainnet','sepolia','base','arbitrum']},
}.items():
 lines=Path(name).read_text().splitlines()
 for start,end in ranges:
  print(f'\n$ numbered SDK source: {name}:{start}-{end}')
  for n in range(start,min(end,len(lines))+1):print(f'{n}: {lines[n-1]}')
