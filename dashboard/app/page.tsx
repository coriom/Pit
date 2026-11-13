import Link from "next/link";
import {tools} from "@/lib/tools";
import ToolSearch from "@/components/tool-search";
export default function Home(){return <><section className="hero"><p className="eyebrow">PIT CRYPTO / DASHBOARD</p><h1>On-chain evidence, clearly presented.</h1><p>Five focused analyses for contracts, distributions, metadata and confirmed events. Results state their coverage and limits.</p></section><ToolSearch tools={tools}/><section className="grid" aria-label="Backend tools">{tools.map(tool=><Link className="card" key={tool.slug} href={`/tools/${tool.slug}`}><span className="eyebrow">{tool.category}</span><h2>{tool.name}</h2><p>{tool.detail}</p><span className="open">Open tool <span aria-hidden="true">↗</span></span></Link>)}</section></>}
