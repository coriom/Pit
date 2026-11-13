import {createHash,createHmac,randomBytes} from "node:crypto";
import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const allowed=/^(?:jobs(?:\/[0-9a-f-]{36}(?:\/(?:export|cancel))?)?|monitors(?:\/[0-9a-f-]{36}(?:\/(?:alerts|pause|resume))?)?)$/i;
async function forward(req:NextRequest,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;const suffix=path.join("/");
  if(!allowed.test(suffix))return NextResponse.json({code:"NOT_FOUND"},{status:404});
  const origin=process.env.PIT_RUST_API_ORIGIN;const secret=process.env.PIT_EDGE_HMAC_KEY;
  const localAllowed=process.env.PIT_DEPLOYMENT_CLASS==="local"&&process.env.PIT_ALLOW_LOCAL_HTTP==="1"&&/^http:\/\/127\.0\.0\.1:\d+$/.test(origin||"");
  if(!origin||(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(origin)&&!localAllowed)||!secret||secret.length<32)return NextResponse.json({code:"GATEWAY_UNAVAILABLE"},{status:503});
  const dashboardOrigin=process.env.PIT_DASHBOARD_ORIGIN;
  if(["POST","DELETE"].includes(req.method)&&(!dashboardOrigin||req.headers.get("origin")!==dashboardOrigin))return NextResponse.json({code:"ORIGIN_DENIED"},{status:403});
  const body=await req.arrayBuffer();if(body.byteLength>256*1024)return NextResponse.json({code:"BODY_LIMIT"},{status:413});
  const query=req.nextUrl.search;
  if(query){
    const exportQuery=(suffix.endsWith("/export")&&(query==="?format=csv"||query==="?format=json"));
    let pageQuery=false;
    if(req.method==="GET"&&/^jobs\/[0-9a-f-]{36}$/i.test(suffix)){
      const params=req.nextUrl.searchParams;
      pageQuery=[...params.keys()].every(key=>["offset","limit"].includes(key)&&params.getAll(key).length===1)
        && [...params.entries()].every(([key,value])=>/^\d+$/.test(value)&&Number(value)<=(key==="limit"?100:5000)&&Number(value)>=(key==="limit"?1:0));
    }
    if(!exportQuery&&!pageQuery)return NextResponse.json({code:"PAGINATION_INVALID"},{status:400});
  }
  const route=`/pit/api/v1/${suffix}${query}`;const timestamp=String(Date.now());const nonce=randomBytes(16).toString("hex");const digest=createHash("sha256").update(Buffer.from(body)).digest("hex");
  const signature=createHmac("sha256",secret).update(`${timestamp}\n${nonce}\n${req.method}\n${route}\n${digest}`).digest("hex");
  const headers=new Headers({"x-pit-edge-timestamp":timestamp,"x-pit-edge-nonce":nonce,"x-pit-edge-signature":signature});
  for(const key of ["content-type","authorization","x-pit-invite","idempotency-key"]){const v=req.headers.get(key);if(v)headers.set(key,v)}
  try {const upstream=await fetch(`${origin}${route}`,{method:req.method,headers,body:req.method==="GET"?undefined:body,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20000)});
    const safe=new Headers({"Content-Type":upstream.headers.get("content-type")||"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});
    const disposition=upstream.headers.get("content-disposition");if(disposition&&/^attachment; filename="pit-[a-z]+-[0-9a-f-]{36}\.(csv|json)"$/i.test(disposition))safe.set("Content-Disposition",disposition);
    return new NextResponse(upstream.body,{status:upstream.status,headers:safe});
  }catch{return NextResponse.json({code:"BACKEND_UNAVAILABLE"},{status:503})}
}
export {forward as GET,forward as POST,forward as DELETE};
