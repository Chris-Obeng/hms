"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  CreditCard,
  ShieldCheck,
  RefreshCw,
  Smartphone,
  Layers,
  Check,
  ChevronDown,
  MessageSquare,
  Shield,
  Zap,
  Globe,
  ArrowRight,
  CheckCircle2,
  Phone,
  Mail,
  MapPin,
  ChevronRight,
  Sparkles,
  Database,
  Layers3
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<"calendar" | "billing" | "sms">("calendar");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleFaq = (index: number) => {
    setExpandedFaq(expandedFaq === index ? null : index);
  };

  const fadeIn = {
    initial: { opacity: 0, y: 15 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }
  };

  const tabs = [
    { id: "calendar", label: "Front Desk Calendar" },
    { id: "billing", label: "Paystack & MoMo" },
    { id: "sms", label: "Arkesel SMS Engine" }
  ] as const;

  const faqs = [
    {
      q: "Can we accept MTN Mobile Money, Telecel Cash, and AirtelTigo?",
      a: "Yes. Through our integrated Paystack gateway, guests can pay deposits or settle invoices instantly using any major African mobile money provider or debit/credit card. Payments are settled directly into your Ghanaian bank account in GHS, eliminating foreign exchange conversion losses."
    },
    {
      q: "Does the system calculate local taxes like NHIL, GETFund, and COVID Levy?",
      a: "Absolutely. The billing engine includes pre-configured local tax settings for the West African market. It automatically handles the calculation and split presentation of VAT, NHIL, GETFund, Tourism Levy, and the COVID-19 Health Recovery Levy on guest invoices."
    },
    {
      q: "What happens if our hotel internet goes offline?",
      a: "RoomLines features a lightweight, offline-resilient client architecture. The front desk team can continue viewing the calendar and guest check-ins using local cache. Once connection is restored, offline entries are seamlessly synced back to the secure Supabase database."
    },
    {
      q: "How long does the setup and onboarding process take?",
      a: "We can get your property live in under 30 minutes. Our support team assists with uploading your room types, configuring your rates, and connecting your Paystack subaccount."
    }
  ];

  return (
    <div className="min-h-screen bg-forest text-ivory overflow-hidden selection:bg-gold/30 selection:text-ivory">
      {/* Background Graphic Orbs */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[70%] h-[60%] bg-gradient-to-l from-gold/[0.04] via-gold/[0.01] to-transparent blur-3xl rounded-full" />
        <div className="absolute top-[30%] left-[-20%] w-[60%] h-[50%] bg-gradient-to-r from-gold/[0.02] via-transparent to-transparent blur-3xl rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.012]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-ivory) 1px, transparent 0)`,
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      {/* Header */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "bg-forest/80 backdrop-blur-xl border-b border-ivory/[0.05] py-3.5 shadow-[0_4px_30px_rgba(0,0,0,0.3)]"
            : "bg-transparent py-5"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#e5c158] to-gold flex items-center justify-center shadow-[0_2px_10px_rgba(212,175,55,0.25)]">
              <span className="text-forest font-bold text-lg">H</span>
            </span>
            <span className="text-xl font-bold tracking-tight text-ivory">
              RoomLine<span className="text-gold font-medium">Pro</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-ivory/60">
            <a href="#features" className="hover:text-ivory transition-colors">Features</a>
            <a href="#demo" className="hover:text-ivory transition-colors">Product Tour</a>
            <a href="#pricing" className="hover:text-ivory transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-ivory transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link href="/sign-in">
              <Button
                variant="ghost"
                size="sm"
                className="text-ivory/60 hover:text-ivory hover:bg-ivory/[0.04] h-9 px-4 text-sm font-medium rounded-lg transition-all"
              >
                Sign In
              </Button>
            </Link>
            <Link href="/sign-up">
              <Button
                size="sm"
                className="bg-gradient-to-b from-[#e5c158] to-gold text-forest hover:to-[#cda632] font-semibold h-9 px-5 text-sm rounded-lg shadow-[0_2px_10px_rgba(212,175,55,0.25)] hover:shadow-[0_4px_15px_rgba(212,175,55,0.4)] transition-all duration-300"
              >
                Get Started
              </Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 max-w-7xl mx-auto px-6 lg:px-8 z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">

          {/* Left Hero Column */}
          <div className="lg:col-span-6 flex flex-col gap-6 max-w-[620px]">
            {/* Announcement Badge */}
            <motion.div {...fadeIn}>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/20 bg-gold/[0.03] px-3.5 py-1.5 text-xs font-semibold text-gold/90 backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-gold opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-gold"></span>
                </span>
                Designed for Hotels in Ghana & Across Africa
              </div>
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]"
            >
              Hotel Management, <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#e5c158] via-gold to-[#cda632]">
                Reimagined for Africa.
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="text-base sm:text-lg text-ivory/50 leading-relaxed font-normal"
            >
              The premium, cloud-native PMS built specifically for West African hotels. Accept local GHS payments via MTN MoMo, manage your front desk calendar in real time, and power your operations with speed.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 pt-2"
            >
              <Link href="/sign-up" className="w-full sm:w-auto">
                <Button className="w-full sm:w-auto px-8 py-6 text-base font-bold rounded-xl bg-gradient-to-b from-[#e5c158] to-gold text-forest hover:shadow-[0_4px_25px_rgba(212,175,55,0.35)] hover:-translate-y-0.5 transition-all duration-300">
                  Start Free Trial <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="#demo" className="w-full sm:w-auto">
                <Button variant="outline" className="w-full sm:w-auto px-8 py-6 text-base font-semibold rounded-xl border-ivory/15 text-ivory/70 hover:bg-ivory/[0.03] hover:text-ivory transition-all">
                  See Product Tour
                </Button>
              </a>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="flex flex-wrap items-center gap-6 pt-4 text-xs font-semibold text-ivory/40"
            >
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-gold/80" /> 14-day Free Trial
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-gold/80" /> No Setup Fee
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-gold/80" /> Local GHS Invoicing
              </span>
            </motion.div>
          </div>

          {/* Right Hero Column: Dashboard Preview */}
          <div className="lg:col-span-6 relative">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full aspect-[4/3] rounded-2xl border border-ivory/[0.06] bg-gradient-to-br from-ivory/[0.02] to-transparent backdrop-blur-md overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.4)]"
            >
              {/* Window Header */}
              <div className="flex items-center justify-between px-4 h-11 border-b border-ivory/[0.04] bg-ivory/[0.01]">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/30" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/30" />
                </div>
                <div className="text-[10px] text-ivory/30 font-semibold tracking-wider uppercase">RoomLine &bull; Calendar</div>
                <div className="w-10" />
              </div>

              {/* Window Content */}
              <div className="p-4 md:p-5 space-y-4">
                {/* Stats Summary Line */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-ivory/[0.02] border border-ivory/[0.04] rounded-xl p-3">
                    <div className="text-[10px] text-ivory/40 uppercase font-semibold">Live Occupancy</div>
                    <div className="text-lg font-bold text-gold mt-0.5">84%</div>
                  </div>
                  <div className="bg-ivory/[0.02] border border-ivory/[0.04] rounded-xl p-3">
                    <div className="text-[10px] text-ivory/40 uppercase font-semibold">Today Revenue</div>
                    <div className="text-lg font-bold text-ivory mt-0.5">GHS 8,450</div>
                  </div>
                  <div className="bg-ivory/[0.02] border border-ivory/[0.04] rounded-xl p-3">
                    <div className="text-[10px] text-ivory/40 uppercase font-semibold">Pending Check-ins</div>
                    <div className="text-lg font-bold text-emerald-400 mt-0.5">6 Rooms</div>
                  </div>
                </div>

                {/* Simulated Room Grid Calendar */}
                <div className="border border-ivory/[0.04] rounded-xl overflow-hidden bg-ivory/[0.005]">
                  <div className="grid grid-cols-6 border-b border-ivory/[0.04] bg-ivory/[0.01] text-[9px] text-ivory/40 font-semibold uppercase p-2 text-center">
                    <div>Room</div>
                    <div>Mon 01</div>
                    <div>Tue 02</div>
                    <div>Wed 03</div>
                    <div>Thu 04</div>
                    <div>Fri 05</div>
                  </div>
                  <div className="divide-y divide-ivory/[0.04] text-[10px] text-ivory/70">
                    <div className="grid grid-cols-6 items-center p-2 text-center">
                      <div className="font-semibold text-left text-ivory/50">101 Standard</div>
                      <div className="col-span-3 bg-gold/10 border border-gold/30 text-gold rounded py-1 font-medium truncate">
                        K. Mensah
                      </div>
                      <div className="col-span-2 text-ivory/20">&mdash;</div>
                    </div>
                    <div className="grid grid-cols-6 items-center p-2 text-center">
                      <div className="font-semibold text-left text-ivory/50">102 Deluxe</div>
                      <div className="text-ivory/20">&mdash;</div>
                      <div className="col-span-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded py-1 font-medium truncate">
                        A. Owusu (MoMo Paid)
                      </div>
                    </div>
                    <div className="grid grid-cols-6 items-center p-2 text-center">
                      <div className="font-semibold text-left text-ivory/50">201 VIP Suite</div>
                      <div className="col-span-5 bg-blue-500/10 border border-blue-500/30 text-blue-400 rounded py-1 font-medium truncate">
                        Direct Booking - G. Cooper
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Main Features Bento Grid */}
      <section id="features" className="py-20 bg-ivory/[0.01] border-t border-b border-ivory/[0.03] relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs uppercase font-bold tracking-widest text-gold mb-3">Enterprise Core Features</h2>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight">Built for Real African Hotels</p>
            <p className="text-ivory/50 mt-4 text-base">We replaced expensive legacy software with a fast, modern system mapped to the needs of Ghanaian hotels.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col gap-4 hover:border-gold/20 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-colors">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ivory">Paystack & MoMo Payments</h3>
              <p className="text-sm text-ivory/50 leading-relaxed">
                Accept MTN MoMo, Telecel Cash, AirtelTigo Money, and bank cards. Automate guest deposits, split settlements, and secure direct reservations directly inside the booking engine.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col gap-4 hover:border-gold/20 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-colors">
                <RefreshCw className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ivory">Real-Time Availability</h3>
              <p className="text-sm text-ivory/50 leading-relaxed">
                Live calendar and availability matrix update instantly across all front desk sessions. Always know which rooms are free, occupied, or blocked — with zero manual refresh needed.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col gap-4 hover:border-gold/20 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-colors">
                <Smartphone className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ivory">Arkesel SMS Automation</h3>
              <p className="text-sm text-ivory/50 leading-relaxed">
                Send automated booking notifications, check-in instructions, and payment receipts directly to guests' phones via Arkesel SMS integration, guaranteeing high delivery rates in Africa.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col gap-4 hover:border-gold/20 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-colors">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ivory">Ghana Tax Compliance</h3>
              <p className="text-sm text-ivory/50 leading-relaxed">
                Out-of-the-box local tax mapping. Compute VAT, NHIL, GETFund, Tourism Levy, and the COVID Health Levy on every invoice automatically. Ready for audits anytime.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col gap-4 hover:border-gold/20 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-colors">
                <Database className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ivory">Offline Resilience</h3>
              <p className="text-sm text-ivory/50 leading-relaxed">
                Designed for low-bandwidth conditions. Our offline-resilient architecture ensures your front desk never stops running when the local internet fluctuates or power drops out.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col gap-4 hover:border-gold/20 transition-all group">
              <div className="w-12 h-12 rounded-xl bg-gold/10 flex items-center justify-center text-gold group-hover:bg-gold/20 transition-colors">
                <Layers3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-ivory">Housekeeping Kanban</h3>
              <p className="text-sm text-ivory/50 leading-relaxed">
                Streamline operations with live room status trackers. Reception lists room updates instantly and housekeeping staff mark room status as dirty, clean, or in-progress in real-time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Tour Showcase */}
      <section id="demo" className="py-20 max-w-7xl mx-auto px-6 lg:px-8 z-10 relative">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-xs uppercase font-bold tracking-widest text-gold mb-3">Live Platform Tour</h2>
          <p className="text-3xl sm:text-4xl font-bold tracking-tight">How RoomLine Streamlines Operations</p>
          <p className="text-ivory/50 mt-3 text-base">Select a module to preview the speed and elegance of the property management interface.</p>
        </div>

        {/* Tour Navigation Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-10 max-w-2xl mx-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all duration-300 ${
                activeTab === tab.id
                  ? "bg-gold text-forest font-bold shadow-[0_2px_10px_rgba(212,175,55,0.2)]"
                  : "bg-ivory/[0.03] text-ivory/60 hover:bg-ivory/[0.06] hover:text-ivory"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Interactive Tour Content Window */}
        <div className="relative rounded-2xl border border-ivory/[0.06] bg-gradient-to-b from-ivory/[0.01] to-transparent p-6 md:p-8 min-h-[380px] flex flex-col justify-between shadow-2xl">
          <AnimatePresence mode="wait">
            {activeTab === "calendar" && (
              <motion.div
                key="calendar"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
              >
                <div className="lg:col-span-5 space-y-4">
                  <span className="text-xs font-bold text-gold uppercase tracking-wider">Drag-and-Drop Scheduler</span>
                  <h3 className="text-2xl font-bold text-ivory">The Ultimate Front Desk Calendar</h3>
                  <p className="text-sm text-ivory/50 leading-relaxed">
                    Designed for swift operations. View your entire booking pipeline in a horizontal timeline. Extend guest stays, assign rooms, or check out guests with quick actions. Room statuses are automatically color-coded so your desk knows exactly which rooms are ready for incoming check-ins.
                  </p>
                </div>
                <div className="lg:col-span-7 bg-forest border border-ivory/[0.06] rounded-xl p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between border-b border-ivory/[0.05] pb-2 text-[10px] text-ivory/40 uppercase font-semibold">
                    <span>Rooms Scheduler</span>
                    <span>July 2026</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-ivory/50">Room 101:</span>
                      <div className="flex-1 bg-gold/20 border border-gold/40 text-gold p-2 rounded flex justify-between font-sans">
                        <span>David Taylor (In)</span>
                        <span className="text-[10px] font-semibold bg-gold/20 px-1.5 rounded">GHC 450/night</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-ivory/50">Room 102:</span>
                      <div className="flex-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2 rounded flex justify-between font-sans">
                        <span>Comfort Addo (In)</span>
                        <span className="text-[10px] font-semibold bg-emerald-500/20 px-1.5 rounded">MoMo Deposit Paid</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-16 text-ivory/50">Room 201:</span>
                      <div className="flex-1 bg-ivory/[0.02] border border-ivory/[0.04] text-ivory/30 p-2 rounded text-center border-dashed font-sans">
                        Available Room (Click to add reservation)
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "billing" && (
              <motion.div
                key="billing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
              >
                <div className="lg:col-span-5 space-y-4">
                  <span className="text-xs font-bold text-gold uppercase tracking-wider">Localized Billing Engine</span>
                  <h3 className="text-2xl font-bold text-ivory">Direct Guest Paystack Collection</h3>
                  <p className="text-sm text-ivory/50 leading-relaxed">
                    Settle guest bills without friction. Direct integration with Paystack allows guests to scan to pay or use their MTN, Telecel, or AirtelTigo Mobile Money wallet. Invoices are automatically calculated, including the tourism levy and GETFund requirements, and logged instantly under the hotel's revenue ledger.
                  </p>
                </div>
                <div className="lg:col-span-7 bg-forest border border-ivory/[0.06] rounded-xl p-5 space-y-4">
                  <div className="flex justify-between items-start border-b border-ivory/[0.05] pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-ivory">Invoice #HOP-2026-0048</h4>
                      <p className="text-[10px] text-ivory/40">Guest: Emmanuel Boateng</p>
                    </div>
                    <span className="text-[10px] font-semibold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                      Paid via MoMo
                    </span>
                  </div>
                  <div className="space-y-1.5 text-xs text-ivory/70">
                    <div className="flex justify-between">
                      <span>Room 102 Deluxe (2 Nights)</span>
                      <span>GHC 1,000.00</span>
                    </div>
                    <div className="flex justify-between text-ivory/45">
                      <span>GETFund (2.5%)</span>
                      <span>GHC 25.00</span>
                    </div>
                    <div className="flex justify-between text-ivory/45">
                      <span>NHIL (2.5%)</span>
                      <span>GHC 25.00</span>
                    </div>
                    <div className="flex justify-between text-ivory/45">
                      <span>VAT (15%)</span>
                      <span>GHC 150.00</span>
                    </div>
                    <div className="flex justify-between text-ivory/45 border-b border-ivory/[0.05] pb-2">
                      <span>COVID Health Levy (1%)</span>
                      <span>GHC 10.00</span>
                    </div>
                    <div className="flex justify-between font-bold text-gold text-sm pt-2">
                      <span>Total Invoice</span>
                      <span>GHC 1,210.00</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === "sms" && (
              <motion.div
                key="sms"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center"
              >
                <div className="lg:col-span-5 space-y-4">
                  <span className="text-xs font-bold text-gold uppercase tracking-wider">SMS Engagement Hub</span>
                  <h3 className="text-2xl font-bold text-ivory">Automated Arkesel Messaging</h3>
                  <p className="text-sm text-ivory/50 leading-relaxed">
                    SMS has a 98% open rate in Ghana. RoomLine leverages the local Arkesel gateway to text guests their booking numbers, check-in instructions, WiFi passwords, and invoice receipts automatically. This keeps your guest service modern and localized.
                  </p>
                </div>
                <div className="lg:col-span-7 bg-forest border border-ivory/[0.06] rounded-xl p-5 space-y-3">
                  <div className="text-sm font-bold text-ivory border-b border-ivory/[0.05] pb-2">SMS Message Log</div>
                  <div className="border border-ivory/[0.05] rounded-xl p-4 bg-ivory/[0.005] max-w-sm mx-auto space-y-2">
                    <div className="text-[10px] text-ivory/45">To: +233 24 123 4567</div>
                    <div className="bg-ivory/[0.03] text-xs p-3 rounded-xl text-ivory/80 leading-relaxed">
                      Hello Frank, your booking at Hilltop Resort is confirmed! Room 102 (Deluxe). Check-in: 03-July-2026. Code: HOP-9482. Thank you!
                    </div>
                    <div className="text-[9px] text-emerald-400 text-right font-semibold uppercase">Delivered via Arkesel</div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      {/* Subscription Pricing Section */}
      <section id="pricing" className="py-20 bg-ivory/[0.01] border-t border-b border-ivory/[0.03] relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs uppercase font-bold tracking-widest text-gold mb-3">Subscription Plans</h2>
            <p className="text-3xl sm:text-4xl font-bold tracking-tight">Simple, Predictable GHS Pricing</p>
            <p className="text-ivory/50 mt-4 text-base">No dollar rate fluctuations. No hidden fees. Cancel or upgrade anytime.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
            {/* Plan 1 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col justify-between hover:border-gold/20 transition-all">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-ivory">Starter Plan</h3>
                  <p className="text-xs text-ivory/40 mt-1">Best for small guest houses & B&Bs</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-ivory">GHC 400</span>
                  <span className="text-xs text-ivory/40">/ month</span>
                </div>
                <ul className="space-y-3.5 text-xs text-ivory/60 border-t border-ivory/[0.05] pt-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Up to 15 Rooms
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> 3 Staff Accounts
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Front Desk Calendar
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Paystack & MoMo Integration
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Arkesel SMS Automations
                  </li>
                </ul>
              </div>
              <Link href="/sign-up" className="block w-full mt-8">
                <Button className="w-full bg-ivory/[0.04] text-ivory hover:bg-ivory/[0.08] hover:text-ivory font-semibold rounded-lg py-2.5">
                  Choose Starter
                </Button>
              </Link>
            </div>

            {/* Plan 2: Most Popular */}
            <div className="bg-forest border-2 border-gold p-8 rounded-2xl flex flex-col justify-between hover:border-gold transition-all relative shadow-[0_10px_30px_rgba(212,175,55,0.1)]">
              <div className="absolute top-0 right-8 -translate-y-1/2 bg-gold text-forest text-[10px] font-extrabold uppercase px-3 py-1 rounded-full tracking-wider shadow">
                Most Popular
              </div>
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-ivory">Growth Plan</h3>
                  <p className="text-xs text-gold/80 mt-1">Perfect for boutique hotels & lodges</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-gold">GHC 750</span>
                  <span className="text-xs text-ivory/40">/ month</span>
                </div>
                <ul className="space-y-3.5 text-xs text-ivory/70 border-t border-ivory/[0.05] pt-6">
                  <li className="flex items-center gap-2 font-medium text-ivory/90">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Up to 40 Rooms
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> 10 Staff Accounts
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Everything in Starter Plan
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Advanced Financial Reports
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Guest CRM History
                  </li>
                </ul>
              </div>
              <Link href="/sign-up" className="block w-full mt-8">
                <Button className="w-full bg-gradient-to-b from-[#e5c158] to-gold text-forest hover:to-[#cda632] font-bold rounded-lg py-2.5 shadow-[0_2px_10px_rgba(212,175,55,0.2)]">
                  Choose Growth
                </Button>
              </Link>
            </div>

            {/* Plan 3 */}
            <div className="bg-forest border border-ivory/[0.05] p-8 rounded-2xl flex flex-col justify-between hover:border-gold/20 transition-all">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-bold text-ivory">Professional Plan</h3>
                  <p className="text-xs text-ivory/40 mt-1">For unlimited rooms and features</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-ivory">GHC 1,400</span>
                  <span className="text-xs text-ivory/40">/ month</span>
                </div>
                <ul className="space-y-3.5 text-xs text-ivory/60 border-t border-ivory/[0.05] pt-6">
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Unlimited Rooms
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Unlimited Staff Accounts
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Everything in Growth Plan
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Custom Domain Integration
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-gold shrink-0" /> API Access for Custom Site
                  </li>
                  <li className="flex items-center gap-2 font-medium text-gold">
                    <Check className="w-4 h-4 text-gold shrink-0" /> Priority 24/7 Whatsapp Support
                  </li>
                </ul>
              </div>
              <Link href="/sign-up" className="block w-full mt-8">
                <Button className="w-full bg-ivory/[0.04] text-ivory hover:bg-ivory/[0.08] hover:text-ivory font-semibold rounded-lg py-2.5">
                  Choose Professional
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section id="faq" className="py-20 max-w-4xl mx-auto px-6 lg:px-8 z-10 relative">
        <div className="text-center mb-14">
          <h2 className="text-xs uppercase font-bold tracking-widest text-gold mb-3">Frequently Asked Questions</h2>
          <p className="text-3xl font-bold tracking-tight">Got Questions? We Have Answers</p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="bg-ivory/[0.01] border border-ivory/[0.04] rounded-2xl overflow-hidden transition-all duration-300"
            >
              <button
                onClick={() => toggleFaq(index)}
                className="w-full flex items-center justify-between p-6 text-left hover:bg-ivory/[0.02] transition-colors"
              >
                <span className="font-bold text-sm md:text-base text-ivory/95">{faq.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-gold shrink-0 transition-transform duration-300 ${
                    expandedFaq === index ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence initial={false}>
                {expandedFaq === index && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                  >
                    <div className="px-6 pb-6 pt-1 text-xs md:text-sm text-ivory/50 leading-relaxed border-t border-ivory/[0.03]">
                      {faq.a}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Call to Action Banner */}
      <section className="py-20 bg-gradient-to-b from-forest to-ivory/[0.02] border-t border-ivory/[0.03] z-10 relative text-center">
        <div className="max-w-4xl mx-auto px-6 lg:px-8 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Ready to Modernize Your Front Desk?</h2>
          <p className="text-ivory/50 max-w-xl mx-auto text-base">
            Join boutique lodges, independent resorts, and guesthouses across Ghana building direct bookings and stopping double bookings.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <Link href="/sign-up">
              <Button className="w-full sm:w-auto px-8 py-6 text-base font-bold rounded-xl bg-gradient-to-b from-[#e5c158] to-gold text-forest hover:shadow-[0_4px_25px_rgba(212,175,55,0.35)] hover:-translate-y-0.5 transition-all duration-300">
                Start 14-Day Free Trial
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button variant="outline" className="w-full sm:w-auto px-8 py-6 text-base font-semibold rounded-xl border-ivory/15 text-ivory/70 hover:bg-ivory/[0.03] hover:text-ivory transition-all">
                Staff Dashboard Login
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-forest border-t border-ivory/[0.03] py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4 md:col-span-1">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded bg-gradient-to-br from-[#e5c158] to-gold flex items-center justify-center font-bold text-forest text-sm">H</span>
              <span className="font-bold text-ivory">RoomLine</span>
            </div>
            <p className="text-xs text-ivory/45 leading-relaxed">
              Premium Property Management System designed specifically for West African hotels. Denominated in GHC. No exchange rate volatility risk.
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-gold">Product</h4>
            <ul className="space-y-2 text-xs text-ivory/45 font-medium">
              <li><a href="#features" className="hover:text-ivory">Features</a></li>
              <li><a href="#demo" className="hover:text-ivory">Tour Showcase</a></li>
              <li><a href="#pricing" className="hover:text-ivory">Pricing Tiers</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-gold">Local Integrations</h4>
            <ul className="space-y-2 text-xs text-ivory/45 font-medium">
              <li><a href="https://paystack.com" target="_blank" className="hover:text-ivory">Paystack Gateway</a></li>
              <li><a href="https://arkesel.com" target="_blank" className="hover:text-ivory">Arkesel SMS Gateway</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-gold">Contact</h4>
            <ul className="space-y-2 text-xs text-ivory/45 font-medium">
              <li className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5 text-gold" /> Airport Residential Area, Accra
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-gold" /> support@RoomLinepro.com
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-gold" /> +233 24 000 0000
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 lg:px-8 border-t border-ivory/[0.03] mt-10 pt-6 flex flex-col sm:flex-row justify-between items-center text-xs text-ivory/30 gap-4">
          <p>&copy; {new Date().getFullYear()} RoomLine. All rights reserved.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-ivory">Terms of Service</a>
            <a href="#" className="hover:text-ivory">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
