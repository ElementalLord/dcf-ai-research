"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [{ href: "/", label: "Home" }, { href: "/explore", label: "Explore" }, { href: "/ai", label: "Ask" }, { href: "/resources", label: "Resources" }];

export function SiteNav() {
  const pathname = usePathname();
  const isCurrent = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`) || (href === "/ai" && pathname === "/ask");
  return <header className="site-header"><div className="site-header-inner">
    <Link className="wordmark" href="/" aria-label="DCF Inspiring Personalities, home">
      <span className="wordmark-mark" aria-hidden="true">DCF</span>
      <span className="wordmark-text"><strong>Inspiring Personalities</strong><small>Dharma Civilization Foundation</small></span>
    </Link>
    <nav aria-label="Main navigation" className="site-nav">{links.map(link => <Link key={link.href} href={link.href} aria-current={isCurrent(link.href) ? "page" : undefined}>{link.label}</Link>)}</nav>
  </div></header>;
}
