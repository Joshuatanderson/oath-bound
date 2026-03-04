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
      className="flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-3 font-mono text-sm transition-colors hover:bg-muted/50"
    >
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
      <span className="flex-1">{command}</span>
      {copied ? (
        <Check className="h-4 w-4 text-success" />
      ) : (
        <Copy className="h-4 w-4 text-muted-foreground" />
      )}
    </div>
  );
}
