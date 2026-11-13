import type { Metadata } from "next";
import Link from "next/link";
import "./styles.css";
export const metadata: Metadata = { title: { default:"PIT Crypto Dashboard",template:"%s · PIT Crypto" },description:"Private, read-only blockchain evidence and monitoring." };
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><header className="topbar"><Link className="brand" href="/">PIT <span>Crypto</span></Link><nav aria-label="Dashboard"><Link href="/">Tools</Link>{process.env.PIT_FREE_ORIGIN?<a href={process.env.PIT_FREE_ORIGIN}>Free tools</a>:<span className="nav-pending">Free tools origin pending</span>}</nav><span className="private">Private preview</span></header><main id="main">{children}</main><footer>Read-only evidence · No wallet or payment required</footer></body></html>}
