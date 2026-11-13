import {notFound} from "next/navigation";
import Link from "next/link";
import {tools, type ToolKind} from "@/lib/tools";
import ToolForm from "@/components/tool-form";
export function generateStaticParams(){return tools.map(t=>({kind:t.slug}))}
export default async function ToolPage({params}:{params:Promise<{kind:string}>}){const {kind}=await params;const tool=tools.find(t=>t.slug===kind);if(!tool)notFound();const localNft=process.env.PIT_DEPLOYMENT_CLASS==="local"&&process.env.PIT_LOCAL_NFT_UI==="1";return <><nav className="crumb" aria-label="Breadcrumb"><Link href="/">Tools</Link><span aria-hidden="true">/</span>{tool.name}</nav><section className="tool-head"><span className="eyebrow">{tool.category}</span><h1>{tool.name}</h1><p>{tool.detail}</p>{kind==="nft"&&!localNft&&<p className="notice">Hosted metadata fetching is disabled until outbound network isolation is verified.</p>}</section><ToolForm kind={kind as ToolKind} localNft={localNft}/></>}
