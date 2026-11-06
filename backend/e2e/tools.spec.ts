import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeFunctionData, parseAbi } from "viem";
const fixture=JSON.parse(readFileSync('/tmp/pit-backend-fixtures.json','utf8'));
async function invite(page: import('@playwright/test').Page){await page.getByLabel('Access code').fill('browser-invite');}
async function completed(page: import('@playwright/test').Page, expected: string){
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.locator('#backend-status')).toContainText(expected,{timeout:25_000});
  await expect(page.locator('#backend-result')).not.toBeEmpty();
  const download=page.waitForEvent('download');await page.locator('#backend-json').click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
}
test('five backend pages are discoverable only in the opted-in local build',async({page})=>{
  await page.goto('/');
  for(const id of ['event-history','contract-permissions','distribution-verifier','nft-metadata-checker','contract-monitor']){
    const link=page.locator(`#product-catalogue a[href="/backend/${id}/"]`).first();
    await expect(link).toHaveCount(1);await page.locator('#directory-search').fill((await link.textContent())!.trim());
    await expect(link).toBeVisible();await link.click();await expect(page.locator('#backend-form')).toBeVisible();await page.goBack();
  }
});
test('event report runs through real local API, worker, PostgreSQL and Anvil',async({page})=>{
  await page.goto('/backend/event-history/');
  await page.getByLabel('Access code').fill('browser-invite');
  await page.getByLabel('Contract address').fill(fixture.token);
  await page.getByLabel('Start block').fill(String(fixture.fromBlock));
  await page.getByLabel('End block').fill(String(fixture.toBlock));
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.locator('#backend-status')).toContainText('COMPLETED',{timeout:20_000});
  await expect(page.locator('#backend-result')).toContainText(fixture.firstTransfer);
  await expect(page.locator('#backend-json')).toBeVisible();
});
test('permission report shows observed role history and unknown source status',async({page})=>{
  await page.goto('/backend/contract-permissions/');await invite(page);
  await page.getByLabel('Contract address').fill(fixture.control);
  await page.getByLabel('Start block').fill(String(fixture.fromBlock));
  await page.getByLabel('End block').fill(String(fixture.toBlock));
  await completed(page,'PARTIAL');
  await expect(page.locator('#backend-result')).toContainText('RoleGranted');
  await expect(page.locator('#backend-result')).toContainText('RoleRevoked');
  expect((await page.locator('#backend-result').textContent())!.toLowerCase()).toContain(fixture.sender.toLowerCase());
});
test('distribution report reconciles two real receipts and flags a wrong amount',async({page})=>{
  await page.goto('/backend/distribution-verifier/');await invite(page);
  await page.getByLabel('ERC-20 token').fill(fixture.token);
  await page.getByLabel('Expected recipients CSV').fill(`recipient,amount\n${fixture.recipient1},1.5\n${fixture.recipient2},2.25`);
  await page.getByLabel('Transaction hashes (one per line)').fill(`${fixture.firstTransfer}\n${fixture.secondTransfer}`);
  await completed(page,'COMPLETED');
  await expect(page.locator('#backend-result')).toContainText('VERIFIED');
  await page.getByLabel('Expected recipients CSV').fill(`recipient,amount\n${fixture.recipient1},1.6`);
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.locator('#backend-status')).toContainText('PARTIAL',{timeout:25_000});
  await expect(page.locator('#backend-result')).toContainText('MISMATCH');
});
test('NFT report reads on-chain token URI and local metadata/media fixture',async({page})=>{
  await page.goto('/backend/nft-metadata-checker/');await invite(page);
  await page.getByLabel('Contract address').fill(fixture.nft);
  await page.getByLabel('Token IDs').fill('1');
  await completed(page,'COMPLETED');
  await expect(page.locator('#backend-result')).toContainText('Fixture NFT');
  await expect(page.locator('#backend-result')).toContainText('ACCESSIBLE');
});
test('monitor continues without browser and persists a newly confirmed alert',async({page,request})=>{
  await page.goto('/backend/contract-monitor/');await invite(page);
  const rpc=async(method:string,params:unknown[]=[])=>{
    const response=await request.post(process.env.PIT_TEST_RPC_URL!,{data:{jsonrpc:'2.0',id:1,method,params}});
    expect(response.ok()).toBeTruthy();return (await response.json()).result;
  };
  const head=Number.parseInt(await rpc('eth_blockNumber'),16);
  await page.getByLabel('Contract address').fill(fixture.token);
  await page.getByLabel('Start block').fill(String(head));
  await page.getByLabel('Threshold in token base units').fill('1000000');
  await page.getByRole('button',{name:'Create monitor'}).click();
  await expect(page.locator('#backend-status')).toContainText('ACTIVE',{timeout:20_000});
  const tx=await rpc('eth_sendTransaction',[{from:fixture.sender,to:fixture.token,data:encodeFunctionData({abi:parseAbi(['function transfer(address,uint256) returns (bool)']),functionName:'transfer',args:[fixture.recipient1,1_200_000n]})}]);
  await rpc('anvil_mine',['0x10']);
  await expect(page.locator('#backend-result')).toContainText(tx,{timeout:25_000});
  await page.getByRole('button',{name:'Pause monitor'}).click();await expect(page.locator('#backend-status')).toContainText('PAUSED');
  await page.getByRole('button',{name:'Resume monitor'}).click();await expect(page.locator('#backend-status')).toContainText('ACTIVE');
  await page.getByRole('button',{name:'Delete monitor'}).click();await expect(page.locator('#backend-status')).toContainText('deleted');
});
test('mobile form and access denial remain clear',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/backend/distribution-verifier/');
  await expect(page.locator('#backend-form')).toBeVisible();
  await page.getByLabel('Access code').fill('wrong-code');
  await page.getByLabel('ERC-20 token').fill(fixture.token);
  await page.getByLabel('Expected recipients CSV').fill('recipient,amount\n0x1111111111111111111111111111111111111111,1');
  await page.getByLabel('Transaction hashes (one per line)').fill(fixture.firstTransfer);
  await page.getByRole('button',{name:'Run report'}).click();
  await expect(page.locator('#backend-status')).toContainText('INVITE_REQUIRED');
  const width=await page.evaluate(()=>document.documentElement.scrollWidth);expect(width).toBeLessThanOrEqual(390);
});
