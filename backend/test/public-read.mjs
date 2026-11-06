// Bounded, read-only compatibility probe against the committed PIT Base Sepolia evidence.
import { clientFor } from '../src/rpc.mjs';
import { scanEvents } from '../src/events.mjs';
const chain='base-sepolia',address='0xF2c716A5EA0240C3D3A49cA1aad81d98e2947475';
const blockNumber=51698212;
const client=clientFor(chain);
const chainId=await client.getChainId();if(chainId!==84532)throw Error('CHAIN_MISMATCH');
const code=await client.getCode({address});if(!code||code==='0x')throw Error('NO_CODE');
const block=await client.getBlock({blockNumber:BigInt(blockNumber)});
const logs=await scanEvents({chain,contract:address,fromBlock:blockNumber,toBlock:blockNumber},{client});
console.log(JSON.stringify({chainId,address,codeBytes:(code.length-2)/2,blockHash:block.hash,scanStatus:logs.status,eventCount:logs.events.length,missing:logs.missing,providerLimitation:logs.providerLimitation}));
