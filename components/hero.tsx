"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

export function Hero() {
  const shouldReduceMotion = useReducedMotion();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const fadeUp = (delay: number) => ({
    initial: { opacity: 0, y: shouldReduceMotion ? 0 : 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] as const }
  });

  return (
    <div className="relative min-h-screen bg-forest text-ivory overflow-hidden selection:bg-gold/30 selection:text-ivory">
      {/* Background — clean premium gradient */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Subtle warm glow from the right */}
        <div className="absolute top-[5%] right-[-10%] w-[60%] h-[90%] bg-gradient-to-l from-gold/[0.04] via-gold/[0.01] to-transparent" />
        <div className="absolute top-[15%] right-[15%] w-[35vw] h-[35vw] max-w-[500px] max-h-[500px] bg-gold/[0.03] blur-[120px] rounded-full" />
        {/* Very subtle grain-like grid on the left */}
        <div
          className="absolute inset-0 opacity-[0.015]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-ivory) 1px, transparent 0)`,
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Navigation */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-forest/80 backdrop-blur-xl border-b border-ivory/[0.04] py-3 shadow-[0_4px_30px_rgba(0,0,0,0.15)]"
            : "bg-transparent py-4 md:py-5"
        }`}
      >
        <div className="max-w-[1280px] mx-auto px-6 md:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 group">
            <span className="text-xl md:text-2xl font-semibold tracking-tight text-ivory transition-colors duration-300">
              HotelOS<span className="text-gold">Pro</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button
                variant="ghost"
                size="sm"
                className="text-ivory/50 hover:text-ivory/80 hover:bg-ivory/[0.04] h-9 px-4 text-sm rounded-lg hidden sm:inline-flex transition-all duration-300"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button
                size="sm"
                className="bg-gradient-to-b from-[#e5c158] to-gold text-forest hover:to-[#cda632] font-semibold h-9 px-5 text-sm rounded-lg shadow-[0_2px_10px_rgba(212,175,55,0.2)] hover:shadow-[0_4px_15px_rgba(212,175,55,0.3)] transition-all duration-300"
              >
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 min-h-screen flex items-center">
        <div className="w-full max-w-[1280px] mx-auto px-6 md:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center pt-28 pb-20 md:pb-28">
          {/* ============ LEFT COLUMN: Content ============ */}
          <div className="flex flex-col gap-5 max-w-[580px]">

            {/* Announcement Badge */}
            <motion.div {...fadeUp(0.08)}>
              <div className="group relative inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/[0.03] px-4 py-1.5 text-xs font-medium text-ivory/60 backdrop-blur-sm transition-all duration-300 hover:bg-gold/[0.06] hover:border-gold/30 cursor-default">
                <span className="relative flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold shadow-[0_0_6px_rgba(212,175,55,0.6)] animate-pulse shrink-0" />
                  Now with Beds24 OTA Sync
                </span>
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1 {...fadeUp(0.15)} className="space-y-0.5">
              <span
                className="block text-ivory/90 font-heading font-semibold tracking-tighter leading-[1.04]"
                style={{ fontSize: "clamp(38px, 6.5vw, 76px)" }}
              >
                Hotel Management,
              </span>
              <span
                className="block text-ivory font-heading font-semibold tracking-tighter leading-[1.04]"
                style={{ fontSize: "clamp(38px, 6.5vw, 76px)" }}
              >
                Reimagined for
              </span>
              <span
                className="block font-heading font-bold tracking-tighter leading-[1.04] text-transparent bg-clip-text bg-gradient-to-r from-[#e5c158] via-gold to-[#cda632] drop-shadow-[0_0_30px_rgba(212,175,55,0.15)]"
                style={{ fontSize: "clamp(38px, 6.5vw, 76px)" }}
              >
                Modern Africa.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              {...fadeUp(0.25)}
              className="text-base md:text-lg text-ivory/45 leading-relaxed max-w-[460px] font-medium"
            >
              The cloud PMS built for Ghanaian hotels. Local GHS payments, automated OTA sync, and an intelligent front desk — all in one platform.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div {...fadeUp(0.3)} className="flex flex-col sm:flex-row items-start gap-3 pt-1">
              <Link href="/sign-up" className="block w-full sm:w-auto">
                <Button
                  className="group w-full sm:w-auto px-7 py-6 text-base rounded-xl bg-gradient-to-b from-[#e5c158] to-gold text-forest font-semibold shadow-[0_4px_20px_rgba(212,175,55,0.25),inset_0_1px_0_rgba(255,255,255,0.4)] hover:shadow-[0_8px_30px_rgba(212,175,55,0.35),inset_0_1px_0_rgba(255,255,255,0.6)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-300"
                >
                  <span className="flex items-center gap-2">
                    Start Free Trial
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </span>
                </Button>
              </Link>
              <Link href="/sign-in" className="block w-full sm:w-auto">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto px-7 py-6 text-base rounded-xl border-ivory/15 text-ivory/60 bg-transparent hover:bg-ivory/[0.03] hover:border-ivory/25 hover:text-ivory/80 transition-all duration-300 font-medium"
                >
                  Sign In
                </Button>
              </Link>
            </motion.div>

            {/* Social Proof */}
            <motion.div
              {...fadeUp(0.4)}
              className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-3 text-xs text-ivory/40 font-medium"
            >
              {[
                { label: "Trusted across Ghana" },
                { label: "Local GHS Payments" },
                { label: "No setup fee" },
              ].map((item) => (
                <span key={item.label} className="flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 text-gold/60 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  {item.label}
                </span>
              ))}
            </motion.div>
          </div>

          {/* ============ RIGHT COLUMN: Dashboard Visual ============ */}
          <motion.div
            initial={{ opacity: 0, x: shouldReduceMotion ? 0 : 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.9, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="relative hidden lg:flex items-center justify-center"
          >
            <div className="relative w-full aspect-[4/3] max-w-[580px]">
              {/* Outer glow ring */}
              <div className="absolute -inset-6 bg-gradient-to-br from-gold/[0.07] via-transparent to-transparent rounded-[32px] blur-3xl" />

              {/* Main dashboard frame */}
              <div className="relative w-full h-full rounded-2xl border border-ivory/[0.06] bg-gradient-to-br from-ivory/[0.03] to-ivory/[0.005] backdrop-blur-sm overflow-hidden shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
                
                {/* Window title bar */}
                <div className="flex items-center gap-1.5 px-4 h-10 border-b border-ivory/[0.04] bg-ivory/[0.01]">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
                  <div className="ml-3 text-[10px] text-ivory/25 font-medium tracking-widest uppercase">HotelOS Pro · Dashboard</div>
                </div>

                {/* Dashboard content */}
                <div className="p-4 md:p-5 space-y-3">
                  
                  {/* KPI cards row */}
                  <div className="grid grid-cols-3 gap-2.5">
                    {[
                      { label: "Occupancy", value: "78%", accent: "from-gold/25 to-gold/5" },
                      { label: "Revenue (MTD)", value: "GHS 12.4k", accent: "from-emerald-500/20 to-emerald-500/5" },
                      { label: "Check-ins", value: "14", accent: "from-blue-500/20 to-blue-500/5" },
                    ].map((stat) => (
                      <div
                        key={stat.label}
                        className={`rounded-xl bg-gradient-to-b ${stat.accent} border border-ivory/[0.04] p-3 md:p-3.5 transition-all duration-300 hover:border-ivory/[0.08]`}
                      >
                        <div className="text-[10px] md:text-[11px] text-ivory/35 font-medium mb-1 tracking-wide uppercase">{stat.label}</div>
                        <div className="text-sm md:text-base font-semibold text-ivory/90 tracking-tight">{stat.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Chart + Bookings row */}
                  <div className="grid grid-cols-5 gap-2.5">
                    {/* Chart area — 3 cols */}
                    <div className="col-span-3 rounded-xl bg-ivory/[0.015] border border-ivory/[0.04] p-3 md:p-3.5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-[10px] md:text-[11px] text-ivory/35 font-medium tracking-wide uppercase">Weekly Revenue</div>
                        <div className="text-[9px] md:text-[10px] text-gold/50 font-semibold">+12.5%</div>
                      </div>
                      <div className="flex items-end gap-[3px] md:gap-1 h-14 md:h-16">
                        {[35, 55, 42, 68, 75, 60, 82].map((h, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-[2px] bg-gradient-to-t from-gold/35 to-gold/10 transition-all duration-500 hover:from-gold/50 hover:to-gold/20"
                            style={{ height: `${h}%` }}
                          >
                            <div className="opacity-0 hover:opacity-100 transition-opacity duration-200 text-[8px] text-gold/60 text-center -mt-4">{h}%</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-between mt-1.5 text-[8px] text-ivory/20 tracking-wide">
                        <span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span>
                      </div>
                    </div>

                    {/* Recent Bookings — 2 cols */}
                    <div className="col-span-2 rounded-xl bg-ivory/[0.015] border border-ivory/[0.04] p-3 md:p-3.5">
                      <div className="text-[10px] md:text-[11px] text-ivory/35 font-medium mb-2.5 tracking-wide uppercase">Recent</div>
                      <div className="space-y-2">
                        {[
                          { room: "Room 204", type: "Deluxe", status: "checked-in" },
                          { room: "Room 108", type: "Standard", status: "checked-in" },
                          { room: "Room 312", type: "Suite", status: "arriving" },
                        ].map((item) => (
                          <div key={item.room} className="flex items-center gap-2.5">
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              item.status === "arriving" ? "bg-gold/60 shadow-[0_0_6px_rgba(212,175,55,0.4)]" : "bg-emerald-500/40"
                            }`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-[10px] md:text-[11px] text-ivory/50 font-medium truncate">{item.room}</div>
                              <div className="text-[8px] md:text-[9px] text-ivory/25">{item.type}</div>
                            </div>
                            <div className={`text-[8px] md:text-[9px] font-medium uppercase tracking-wider ${
                              item.status === "arriving" ? "text-gold/50" : "text-emerald-500/40"
                            }`}>
                              {item.status === "arriving" ? "Today" : "In"}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Bottom: OTA Sync Status */}
                  <div className="rounded-xl bg-gradient-to-r from-gold/[0.03] via-gold/[0.01] to-transparent border border-gold/[0.06] p-3 md:p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 md:w-8 md:h-8 rounded-full border border-gold/20 flex items-center justify-center bg-gold/[0.03]">
                        <svg className="w-3.5 h-3.5 md:w-4 md:h-4 text-gold/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-[10px] md:text-[11px] text-ivory/45 font-medium">OTA Sync Status</div>
                        <div className="text-[8px] md:text-[9px] text-gold/40 tracking-wide">Booking.com · Expedia · Airbnb</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[9px] md:text-[10px] text-emerald-500/50 font-semibold">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/50 shadow-[0_0_6px_rgba(52,211,153,0.3)]" />
                      All Connected
                    </div>
                  </div>
                </div>
              </div>

              {/* Floating decorative orbs */}
              <motion.div
                className="absolute -top-4 -right-2 w-20 h-20 rounded-full bg-gradient-to-br from-gold/[0.08] to-transparent blur-xl pointer-events-none"
                animate={{ y: shouldReduceMotion ? 0 : [0, -10, 0] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="absolute -bottom-3 -left-5 w-24 h-24 rounded-full bg-gradient-to-br from-gold/[0.05] to-transparent blur-xl pointer-events-none"
                animate={{ y: shouldReduceMotion ? 0 : [0, 8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
              />
            </div>
          </motion.div>
        </div>
      </main>

      {/* Bottom Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-24 md:h-32 bg-gradient-to-t from-forest via-forest/80 to-transparent pointer-events-none z-20" />
    </div>
  );
}
