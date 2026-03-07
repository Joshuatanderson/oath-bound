"use client";

import { useState } from "react";
import { Copy, Check, ChevronRight } from "lucide-react";

export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCopy}
      onKeyDown={(e) => e.key === "Enter" && handleCopy()}
      className="flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 font-mono text-xs transition-colors hover:bg-muted/50 sm:px-4 sm:py-3 sm:text-sm"
    >
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">{command}</span>
      {copied ? (
        <Check className="h-4 w-4 shrink-0 text-success" />
      ) : (
        <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </div>
  );
}
