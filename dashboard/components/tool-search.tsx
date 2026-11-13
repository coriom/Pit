"use client";
import {useState} from "react";
import Link from "next/link";
import type {tools} from "@/lib/tools";
export default function ToolSearch({tools:all}:{tools:typeof tools}){const [query,setQuery]=useState("");const norm=(s:string)=>s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"").replace(/[-_]/g," ");const terms=norm(query).split(/\s+/).filter(Boolean);const found=all.filter(t=>terms.every(x=>norm(`${t.name} ${t.detail} ${t.category}`).includes(x)));return <div className="search"><label htmlFor="tool-search">Find a tool</label><input id="tool-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Events, permissions, distribution…"/><p role="status">{query?`${found.length} result${found.length===1?"":"s"}`:"Search the five backend tools"}</p>{query&&<div className="search-results">{found.map(t=><Link key={t.slug} href={`/tools/${t.slug}`}>{t.name} <span aria-hidden="true">↗</span></Link>)}</div>}</div>}
