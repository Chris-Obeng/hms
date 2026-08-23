"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="inline-flex size-9 items-center justify-center rounded-lg text-[var(--bk-muted)] hover:text-[var(--bk-ink)] hover:bg-[var(--bk-surface-soft)] transition-colors cursor-pointer touch-manipulation"
      title="Copy reference"
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}
