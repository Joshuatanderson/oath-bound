"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LlmsPage() {
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/docs.md")
      .then((r) => r.text())
      .then(setContent);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">llms.txt</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(content);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <>
              <Check className="mr-2 h-4 w-4 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="whitespace-pre-wrap rounded-lg border bg-muted p-6 text-sm leading-relaxed">
        {content}
      </pre>
    </main>
  );
}
