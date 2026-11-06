import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture=JSON.parse(readFileSync('/tmp/pit-backend-fixtures.json','utf8'));
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
