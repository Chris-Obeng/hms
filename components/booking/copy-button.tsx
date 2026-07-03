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
      className="text-[#A8A29E] hover:text-[#1C1917] transition-colors"
      title="Copy reference"
    >
      {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
    </button>
  );
}
