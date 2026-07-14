import { Hero } from "@/components/hero";
import { Button } from "@heroui/react";

export default function Home() {
  return (
    <main className="relative">
      <Hero />
      
      {/* HeroUI v3 Smoke Test Button */}
      <div className="fixed bottom-6 right-6 z-50 p-4 bg-zinc-950/90 backdrop-blur-md rounded-2xl border border-white/10 shadow-2xl flex flex-col gap-2">
        <span className="text-[10px] font-extrabold uppercase tracking-widest text-gold">HeroUI v3 Test</span>
        <Button variant="primary" size="sm">
          HeroUI Button
        </Button>
      </div>
    </main>
  );
}
