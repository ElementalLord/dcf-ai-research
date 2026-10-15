"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/explore", label: "Explore" }, { href: "/ai", label: "Ask" }, { href: "/resources", label: "Resources" }];
export function SiteNav() {
  const pathname = usePathname();
  return <header className="site-header"><div className="site-header-inner"><Link className="wordmark" href="/" aria-label="DCF home">DCF<span className="wordmark-dot">.</span></Link><nav aria-label="Main navigation" className="site-nav">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href || pathname.startsWith(`${link.href}/`) || (link.href === "/ai" && pathname === "/ask") ? "page" : undefined}>{link.label}</Link>)}</nav></div></header>;
}
