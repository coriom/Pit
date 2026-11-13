import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
const enabled=process.env.PIT_V2_LIVE_FIXTURE==="1";
test.skip(!enabled,"Requires disposable local PostgreSQL, Anvil, Rust API and worker");
const fixture=enabled?JSON.parse(readFileSync("/tmp/pit-v2-parity-local.json","utf8")):null;
const invite="local-test-private-invite";
async function begin(page:import("@playwright/test").Page,kind:string,contract:string){await page.goto(`/tools/${kind}`);await page.getByLabel("Private invitation").fill(invite);await page.getByLabel("Network").selectOption("base-sepolia");await page.getByLabel(kind==="distribution"?"Token address":"Contract address").fill(contract)}
test("browser → Rust API → PostgreSQL worker: events, permissions and distribution",async({page})=>{
  test.setTimeout(90000);
  await begin(page,"events",fixture.token);await page.getByLabel("From block").fill(String(fixture.from));await page.getByLabel("To block").fill(String(fixture.last));await page.getByRole("button",{name:"Run analysis"}).click();await expect(page.locator(".status-pill")).toContainText("COMPLETED",{timeout:30000});await expect(page.locator(".output pre")).toContainText(fixture.transactionHashes[0]);
  await begin(page,"permissions",fixture.control);await page.getByLabel("From block").fill("0");await page.getByLabel("To block").fill(String(fixture.last));await page.getByRole("button",{name:"Run analysis"}).click();await expect(page.locator(".status-pill")).toContainText("PARTIAL",{timeout:30000});await expect(page.locator(".output pre")).toContainText("Ownable");
  await begin(page,"distribution",fixture.token);await page.getByLabel("Expected recipient CSV").fill(`recipient,amount\n${fixture.recipient1},1.5\n${fixture.recipient2},2.25`);await page.getByLabel("Transaction hashes, one per line").fill(fixture.transactionHashes.join("\n"));await page.getByRole("button",{name:"Run analysis"}).click();await expect(page.locator(".status-pill")).toContainText("COMPLETED",{timeout:30000});await expect(page.locator(".output pre")).toContainText("3750000");
});
test("browser monitor persists a new confirmed Anvil mint alert",async({page})=>{
  test.setTimeout(60000);
  const rpc=async(method:string,params:unknown[]=[])=>{const r=await fetch("http://127.0.0.1:58545",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});const body=await r.json();if(body.error)throw Error(body.error.message);return body.result};
  const head=Number(BigInt(await rpc("eth_blockNumber")));await begin(page,"monitor",fixture.token);await page.getByLabel("Start block").fill(String(head));await page.getByLabel("Rule").selectOption("mint");await page.getByRole("button",{name:"Create monitor"}).click();await expect(page.locator(".status-pill")).toContainText("ACTIVE",{timeout:30000});
  const accounts:string[]=await rpc("eth_accounts");const data=`0x40c10f19${accounts[1].slice(2).padStart(64,"0")}${(3_000_000).toString(16).padStart(64,"0")}`;await rpc("eth_sendTransaction",[{from:accounts[0],to:fixture.token,data,gas:"0x7a1200"}]);await rpc("anvil_mine",["0x10"]);
  await expect(page.locator(".output pre")).toContainText("Transfer",{timeout:45000});await page.getByRole("button",{name:"Delete"}).click();await expect(page.locator(".status-pill")).toHaveCount(0);
});
