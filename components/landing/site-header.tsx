"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Menu, X } from "lucide-react";
import { Button } from "@heroui/react";
import { Logo } from "./logo";

const links = [{ href: "#platform", label: "Platform" }, { href: "#hospitality", label: "Why RoomLine" }, { href: "#getting-started", label: "Getting started" }] as const;

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <header className="lp-header" onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); } }}>
      <div className="lp-container lp-header-inner">
        <Link href="/" className="lp-wordmark" aria-label="RoomLine home"><Logo /><span>RoomLine<span className="lp-wordmark-period">.</span></span></Link>
        <nav className="lp-desktop-nav" aria-label="Main navigation">{links.map((item) => <a key={item.href} href={item.href}>{item.label}</a>)}</nav>
        <div className="lp-header-actions"><Link href="/sign-in" className="lp-sign-in">Sign in<ArrowRight size={14} aria-hidden="true" /></Link><a className="lp-btn lp-btn--accent lp-header-cta" href="#demo">Book a demo<ArrowRight size={15} aria-hidden="true" /></a><Button ref={trigger} variant="ghost" isIconOnly className="lp-menu-toggle" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="mobile-navigation" onPress={() => setOpen(!open)}>{open ? <X size={20} /> : <Menu size={20} />}</Button></div>
      </div>
      {open && <nav id="mobile-navigation" className="lp-mobile-nav lp-container" aria-label="Mobile navigation">{links.map((item) => <a key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}<ArrowRight size={16} aria-hidden="true" /></a>)}<a href="#demo" onClick={() => setOpen(false)}>Book a demo<ArrowRight size={16} aria-hidden="true" /></a><Link href="/sign-in" onClick={() => setOpen(false)}>Sign in<ArrowRight size={16} aria-hidden="true" /></Link></nav>}
    </header>
  );
}
