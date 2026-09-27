"use client";

import * as React from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

export function BookingPageCard({ url, hotelName }: { url: string; hotelName: string }) {
  const [copied, setCopied] = React.useState(false);

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const display = url.replace(/^https?:\/\//, "");
  const isDev = url.includes("localhost");

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider">Your Booking Page</p>
          <p className="text-xs text-muted-foreground mt-0.5">Share this link so guests can book {hotelName} directly.</p>
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="size-3.5" />
          Open
        </a>
      </div>

      <div className="flex items-center gap-2 h-9 rounded-lg border border-border/60 bg-background px-3">
        <span className="flex-1 text-sm font-mono text-foreground/80 truncate select-all">{display}</span>
        <button
          onClick={copy}
          className="shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {copied
            ? <><Check className="size-3.5 text-emerald-600" /><span className="text-emerald-600">Copied</span></>
            : <><Copy className="size-3.5" /><span>Copy</span></>
          }
        </button>
      </div>

      {isDev && (
        <p className="text-[11px] text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
          Local dev URL. Replace <code className="font-mono bg-amber-500/20 px-1 rounded">localhost:3000</code> with your domain in production.
        </p>
      )}
    </div>
  );
}
