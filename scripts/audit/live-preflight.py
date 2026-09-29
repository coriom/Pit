"""Read-only preflight. Never print environment values or credential material."""
import pathlib,subprocess,os,re,json
print('$ git status --short',flush=True);subprocess.run(['git','status','--short'],check=True)
print('$ git rev-parse HEAD',flush=True);subprocess.run(['git','rev-parse','HEAD'],check=True)
for name,patterns in {'src/lib/config.ts':['FEES_ENABLED: false','MAINNET_ENABLED: false','feeRecipient: ""','builderAddress: ""'],'src/lib/hyperliquid.ts':['new HttpTransport({ isTestnet: true })']}.items():
 s=pathlib.Path(name).read_text()
 for pattern in patterns:assert pattern in s;print(name+': '+pattern)
print('CoW permitted trading chain: Sepolia 11155111; actual wallet chain NOT VERIFIED until external provider attached.')
print('Hyperliquid transport: https://api.hyperliquid-testnet.xyz (info/exchange)')
required=['PIT_LIVE_CDP_URL','PIT_TEST_ACCOUNT','PIT_SEPOLIA_SELL_TOKEN','PIT_SEPOLIA_BUY_TOKEN','PIT_SEPOLIA_SELL_AMOUNT','PIT_HL_PRICE','PIT_HL_SIZE']
print('Public live parameters:',json.dumps({key:'SET (value withheld)' if os.environ.get(key) else 'MISSING' for key in required}))
secret_keys=[k for k in os.environ if k.startswith(('PIT_','PUBLIC_')) and re.search('PRIVATE|MNEMONIC|SEED|SECRET|API_KEY|TOKEN|PASSWORD',k) and k not in ['PIT_SEPOLIA_SELL_TOKEN','PIT_SEPOLIA_BUY_TOKEN'] and os.environ[k]]
print('Secret-named PIT/PUBLIC environment variables present:',len(secret_keys))
assert not secret_keys,'Secret-named app environment variables must be removed before live execution'
print('Root environment files:',json.dumps(sorted(p.name for p in pathlib.Path('.').glob('.env*') if p.is_file())))
print('No process environment values were logged; external wallet custody is required.')
