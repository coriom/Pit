import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {createServer} from "node:http";
const enabled=process.env.PIT_V2_LIVE_FIXTURE==="1";
test.skip(!enabled,"Requires disposable local PostgreSQL, Anvil, Rust API and worker");
const fixture=enabled?JSON.parse(readFileSync("/tmp/pit-v2-parity-local.json","utf8")):null;
const invite="local-test-private-invite";
async function begin(page:import("@playwright/test").Page,kind:string,contract:string){await page.goto(`/tools/${kind}`);await page.getByLabel("Private invitation").fill(invite);await page.getByLabel("Network").selectOption("base-sepolia");await page.getByLabel(kind==="distribution"?"Token address":"Contract address").fill(contract)}
test("browser → Rust API → PostgreSQL worker: events, permissions and distribution",async({page})=>{
  test.setTimeout(90000);
  await begin(page,"events",fixture.token);await page.getByLabel("From block").fill(String(fixture.from));await page.getByLabel("To block").fill(String(fixture.last));await page.getByLabel("Event ABI JSON (optional)").fill(JSON.stringify([{type:"event",name:"Transfer",inputs:[{name:"from",type:"address",indexed:true},{name:"to",type:"address",indexed:true},{name:"value",type:"uint256",indexed:false}]}]));await page.getByRole("button",{name:"Run analysis"}).click();await expect(page.locator(".status-pill")).toContainText("COMPLETED",{timeout:30000});await expect(page.locator(".output pre")).toContainText(fixture.transactionHashes[0]);await expect(page.locator(".output pre")).toContainText("Transfer");
  await begin(page,"permissions",fixture.control);await page.getByLabel("From block").fill("0");await page.getByLabel("To block").fill(String(fixture.last));await page.getByRole("button",{name:"Run analysis"}).click();await expect(page.locator(".status-pill")).toContainText("PARTIAL",{timeout:30000});await expect(page.locator(".output pre")).toContainText("Ownable");
  await begin(page,"distribution",fixture.token);await page.getByLabel("Expected recipient CSV").fill(`recipient,amount\n${fixture.recipient1},1.5\n${fixture.recipient2},2.25`);await page.getByLabel("Transaction hashes, one per line").fill(fixture.transactionHashes.join("\n"));await page.getByRole("button",{name:"Run analysis"}).click();await expect(page.locator(".status-pill")).toContainText("COMPLETED",{timeout:30000});await expect(page.locator(".output pre")).toContainText("3750000");
});
test("browser monitor persists a new confirmed Anvil mint alert",async({page})=>{
  test.setTimeout(60000);
  const rpc=async(method:string,params:unknown[]=[])=>{const r=await fetch("http://127.0.0.1:58545",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});const body=await r.json();if(body.error)throw Error(body.error.message);return body.result};
  const head=Number(BigInt(await rpc("eth_blockNumber")));await begin(page,"monitor",fixture.token);await page.getByLabel("Start block").fill(String(head));await page.getByLabel("Rule").selectOption("mint");await page.getByRole("button",{name:"Create monitor"}).click();await expect(page.locator(".status-pill")).toContainText("ACTIVE",{timeout:30000});
  const accounts:string[]=await rpc("eth_accounts");const data=`0x40c10f19${accounts[1].slice(2).padStart(64,"0")}${(3_000_000).toString(16).padStart(64,"0")}`;await rpc("eth_sendTransaction",[{from:accounts[0],to:fixture.token,data,gas:"0x7a1200"}]);await rpc("anvil_mine",["0x10"]);
  await expect(page.locator(".output pre")).toContainText("Transfer",{timeout:45000});
  await page.getByRole("button",{name:"Pause"}).click();await expect(page.locator(".status-pill")).toContainText("PAUSED",{timeout:15000});
  await page.getByRole("button",{name:"Resume"}).click();await expect(page.locator(".status-pill")).toContainText("ACTIVE",{timeout:15000});
  await page.getByRole("button",{name:"Delete"}).click();await expect(page.locator(".status-pill")).toHaveCount(0);
});
test("browser NFT workflow uses Rust API, worker, PostgreSQL and a bounded local HTTP fixture",async({page})=>{
  test.setTimeout(90000);
  const origin="http://127.0.0.1:58546";
  const fixtureServer=createServer((req,res)=>{
    if(req.url==="/token/1"){res.writeHead(200,{"Content-Type":"application/json"});res.end(JSON.stringify({name:"Browser Fixture NFT",description:"Local metadata",image:`${origin}/image.png`}));return}
    if(req.url==="/image.png"){res.writeHead(200,{"Content-Type":"image/png"});res.end(req.method==="HEAD"?undefined:Buffer.from([137,80,78,71]));return}
    res.writeHead(404);res.end();
  });
  await new Promise<void>(resolve=>fixtureServer.listen(58546,"127.0.0.1",resolve));
  try{
    const rpc=async(method:string,params:unknown[]=[])=>{const response=await fetch("http://127.0.0.1:58545",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});const result=await response.json();if(result.error)throw Error(result.error.message);return result.result};
    const accounts:string[]=await rpc("eth_accounts");
    const uri=`${origin}/token/1`;const encoded=Buffer.from(uri).toString("hex");
    const word=(value:number)=>value.toString(16).padStart(64,"0");
    const data=`0xe0df5b6f${word(32)}${word(encoded.length/2)}${encoded.padEnd(Math.ceil(encoded.length/64)*64,"0")}`;
    await rpc("eth_sendTransaction",[{from:accounts[0],to:fixture.nft,data,gas:"0x7a1200"}]);
    await begin(page,"nft",fixture.nft);await page.getByLabel("Token IDs, comma separated").fill("1");
    await expect(page.getByRole("button",{name:"Run analysis"})).toBeEnabled();
    await page.getByRole("button",{name:"Run analysis"}).click();
    await expect(page.locator(".status-pill")).toContainText("COMPLETED",{timeout:45000});
    await expect(page.locator(".output pre")).toContainText("Browser Fixture NFT");
  }finally{await new Promise<void>(resolve=>fixtureServer.close(()=>resolve()))}
});
