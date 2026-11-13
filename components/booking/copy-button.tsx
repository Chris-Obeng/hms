"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex size-8 md:size-9 shrink-0 items-center justify-center rounded-[12px] bg-white text-[#0485F7] shadow-[0_1px_3px_rgb(0_0_0/0.08)] hover:bg-[#F5F5F5] active:scale-95 transition-all cursor-pointer touch-manipulation"
      aria-label={copied ? "Copied booking reference" : "Copy booking reference"}
      title="Copy reference"
    >
      {copied ? (
        <Check className="size-4 text-[#17C964]" strokeWidth={2.25} />
      ) : (
        <Copy className="size-4 md:size-4" strokeWidth={2} />
      )}
    </button>
  );
}
