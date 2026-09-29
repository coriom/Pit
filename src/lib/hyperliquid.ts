import { ExchangeClient, HttpTransport, InfoClient } from '@nktkas/hyperliquid';
import { isAddress, zeroAddress, type WalletClient, type Account, type Transport, type Chain } from 'viem';
import { config } from './config';
// Testnet is intentional, independent of wallet EVM network and fee settings.
export const hlTransport = new HttpTransport({ isTestnet: true });
export const hlInfo = new InfoClient({ transport: hlTransport });
export function bpsToTenths(bps: string, kind: 'perps'|'spot' = 'perps') {
  if (!/^\d+(\.\d)?$/.test(bps)) throw new Error('Use nonnegative bps with at most one decimal');
  const [whole, fraction='0']=bps.split('.'); const n=Number(whole)*10+Number(fraction);
  return capBuilderFee(n,kind);
}
export function capBuilderFee(f:number,kind:'perps'|'spot'='perps') { if(!Number.isSafeInteger(f)||f<0||f>(kind==='perps'?100:1000))throw new Error('Builder fee exceeds hard cap');return f; }
export function builderRate(f:number) { capBuilderFee(f); return `${f/1000}%`; }
export function builderConfig(enabled=config.FEES_ENABLED) {
  if(!enabled)return undefined;
  if(!isAddress(config.builderAddress)||config.builderAddress===zeroAddress)throw new Error('Configure a nonzero builder address');
  return {b:config.builderAddress.toLowerCase() as `0x${string}`,f:capBuilderFee(config.builderFeeTenthsBps)};
}
function exchange(wallet:WalletClient){if(!wallet.account)throw new Error('Connect main wallet');return new ExchangeClient({transport:hlTransport,wallet:wallet as WalletClient<Transport,Chain,Account>});}
export async function approveBuilder(wallet:WalletClient) { const builder=builderConfig();if(!builder)throw new Error('Fees are disabled; approval is unnecessary');return exchange(wallet).approveBuilderFee({builder:builder.b,maxFeeRate:builderRate(builder.f)}); }
export function validateOrderNumbers(price:string,size:string,szDecimals:number){
  if(!/^\d+(\.\d+)?$/.test(price)||!/^\d+(\.\d+)?$/.test(size)||Number(price)<=0||Number(size)<=0||!Number.isFinite(Number(price))||!Number.isFinite(Number(size)))throw new Error('Enter positive decimal price and size');
  if((size.split('.')[1]?.length??0)>szDecimals)throw new Error(`Size supports ${szDecimals} decimal places`);
  const normalized=price.replace(/\.0+$/,'');const significant=normalized.replace('.','').replace(/^0+/,'').length;
  if(normalized.includes('.')&&(significant>5||(normalized.split('.')[1]?.length??0)>6-szDecimals))throw new Error('Price exceeds Hyperliquid precision limits');
}
export async function placePerp(wallet:WalletClient,asset:number,isBuy:boolean,price:string,size:string,reduceOnly:boolean) {
  if(!wallet.account)throw new Error('Connect main wallet');
  const meta=await hlInfo.meta();const market=meta.universe[asset];if(!market||market.isDelisted)throw new Error('Market unavailable');validateOrderNumbers(price,size,market.szDecimals);
  const builder=builderConfig();
  if(builder && await hlInfo.maxBuilderFee({user:wallet.account.address,builder:builder.b})<builder.f)throw new Error('Approve builder fee first');
  const result=await exchange(wallet).order({orders:[{a:asset,b:isBuy,p:price,s:size,r:reduceOnly,t:{limit:{tif:'Gtc'}}}],grouping:'na',...(builder?{builder}:{})});
  const failure=result.response.data.statuses.find(s=>typeof s==='object'&&'error'in s);if(failure&&typeof failure==='object'&&'error'in failure)throw new Error(String(failure.error));
  return result;
}
export async function readPerps(user:`0x${string}`){const [positions,orders,fills,funding]=await Promise.all([hlInfo.clearinghouseState({user}),hlInfo.openOrders({user}),hlInfo.userFills({user}),hlInfo.userFunding({user,startTime:Date.now()-30*86400000})]);return {positions,orders,fills,funding};}
