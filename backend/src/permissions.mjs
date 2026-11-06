import { keccak256, stringToHex, toHex } from 'viem';
import { assertChain, clientFor } from './rpc.mjs';
import { scanEvents } from './events.mjs';
import { rpcFor } from './config.mjs';

const slot = name => toHex(BigInt(keccak256(stringToHex(name)))-1n,{size:32});
const implSlot=slot('eip1967.proxy.implementation');
const adminSlot=slot('eip1967.proxy.admin');
const roleIds = Object.fromEntries(['MINTER_ROLE','PAUSER_ROLE','DEFAULT_ADMIN_ROLE'].map(name=>[name,name==='DEFAULT_ADMIN_ROLE'?`0x${'0'.repeat(64)}`:keccak256(stringToHex(name))]));
const abi = [
  { type:'function', name:'owner', stateMutability:'view', inputs:[], outputs:[{type:'address'}] },
  { type:'function', name:'pendingOwner', stateMutability:'view', inputs:[], outputs:[{type:'address'}] },
  { type:'function', name:'paused', stateMutability:'view', inputs:[], outputs:[{type:'bool'}] },
  { type:'function', name:'getRoleAdmin', stateMutability:'view', inputs:[{type:'bytes32'}], outputs:[{type:'bytes32'}] },
  { type:'event',name:'OwnershipTransferred',inputs:[{name:'previousOwner',type:'address',indexed:true},{name:'newOwner',type:'address',indexed:true}] },
  { type:'event',name:'RoleGranted',inputs:[{name:'role',type:'bytes32',indexed:true},{name:'account',type:'address',indexed:true},{name:'sender',type:'address',indexed:true}] },
  { type:'event',name:'RoleRevoked',inputs:[{name:'role',type:'bytes32',indexed:true},{name:'account',type:'address',indexed:true},{name:'sender',type:'address',indexed:true}] },
  { type:'event',name:'Upgraded',inputs:[{name:'implementation',type:'address',indexed:true}] },
];
const roleTopic = keccak256(stringToHex('RoleGranted(bytes32,address,address)'));
const revokedTopic = keccak256(stringToHex('RoleRevoked(bytes32,address,address)'));
const ownershipTopic = keccak256(stringToHex('OwnershipTransferred(address,address)'));
const upgradedTopic = keccak256(stringToHex('Upgraded(address)'));
const slotAddress = value => value && !/^0x0+$/.test(value) ? `0x${value.slice(-40)}` : null;
export async function sourcifyStatus(chain,address,{fetcher=fetch}={}){
  const url=`https://sourcify.dev/server/v2/contract/${rpcFor(chain).id}/${address}`;
  try{const response=await fetcher(url,{signal:AbortSignal.timeout(5000),redirect:'error'});if(response.status===404)return {status:'NOT_VERIFIED',url};if(!response.ok)return {status:'UNKNOWN',url};const data=await response.json();return {status:data.match||data.matchType||'VERIFIED',url};}catch{return {status:'UNKNOWN',url};}
}
export async function analyzePermissions(input,{client=clientFor(input.chain),sourceLookup=sourcifyStatus}={}) {
  await assertChain(client,input.chain);
  const block=BigInt(input.toBlock), code=await client.getCode({address:input.contract,blockNumber:block});
  if(!code || code==='0x') throw new Error('NO_CONTRACT_CODE');
  const read=async name=>client.readContract({address:input.contract,abi,functionName:name,blockNumber:block}).catch(()=>null);
  const [owner,pendingOwner,paused,implementationRaw,proxyAdminRaw]=await Promise.all([
    read('owner'),read('pendingOwner'),read('paused'),
    client.getStorageAt({address:input.contract,slot:implSlot,blockNumber:block}).catch(()=>null),
    client.getStorageAt({address:input.contract,slot:adminSlot,blockNumber:block}).catch(()=>null)
  ]);
  const roleAdmins={};
  for (const [name,id] of Object.entries(roleIds)) {
    const value=await client.readContract({address:input.contract,abi,functionName:'getRoleAdmin',args:[id],blockNumber:block}).catch(()=>null);
    if(value!==null) roleAdmins[name]={role:id,adminRole:value};
  }
  const topics=[roleTopic,revokedTopic,ownershipTopic,upgradedTopic], history=[];let coverage='COMPLETE';const missing=[];
  for(const topic0 of topics){
    const result=await scanEvents({...input,topic0,abi},{client});
    history.push(...result.events.map(e=>({event:e.decoded?.eventName??null,args:e.decoded?.args??null,blockNumber:e.blockNumber,transactionHash:e.transactionHash,logIndex:e.logIndex,blockHash:e.blockHash})));
    if(result.status!=='COMPLETE'){coverage='PARTIAL';missing.push(...result.missing);}
  }
  history.sort((a,b)=>a.blockNumber-b.blockNumber||a.logIndex-b.logIndex);
  const knownRoleHolders={};
  // Event reconstruction is never a complete membership proof unless genesis-to-analysis coverage is known.
  for(const h of history){if(!['RoleGranted','RoleRevoked'].includes(h.event)||!h.args)continue;const key=h.args.role;const holders=knownRoleHolders[key]??new Set();if(h.event==='RoleGranted')holders.add(h.args.account.toLowerCase());else holders.delete(h.args.account.toLowerCase());knownRoleHolders[key]=holders;}
  const verifiedSource=await sourceLookup(input.chain,input.contract);
  const status=coverage==='COMPLETE' && !['UNKNOWN','NOT_VERIFIED'].includes(verifiedSource.status) ? 'COMPLETE' : 'PARTIAL';
  return {status,contract:input.contract,chain:input.chain,analysisBlock:input.toBlock,codeHash:keccak256(code),verifiedSource,permissionModel:owner?'Ownable':Object.keys(roleAdmins).length?'AccessControl compatible':'UNKNOWN',facts:{owner:owner??null,pendingOwner:pendingOwner??null,paused:paused??null,proxyImplementation:slotAddress(implementationRaw),proxyAdmin:slotAddress(proxyAdminRaw),roleAdmins,observedRoleHolders:Object.fromEntries(Object.entries(knownRoleHolders).map(([k,v])=>[k,[...v]]))},history,coverage:{status:coverage,requested:[input.fromBlock,input.toBlock],missing,roleEnumeration:input.fromBlock===0&&coverage==='COMPLETE'?'event-derived; still requires constructor and implementation review':'INCOMPLETE'},limitations:['Recognized getters and event signatures only; arbitrary privileges are not ruled out.','Verified source is not a security guarantee.','Role events do not prove complete membership if deployment history or constructor assignments are missing.']};
}
