"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase.client";

function CLILoginInner() {
  const searchParams = useSearchParams();
  const port = searchParams.get("port");

  useEffect(() => {
    if (!port || !/^\d+$/.test(port)) return;

    // Store port in a cookie so /auth/callback can redirect tokens to the CLI
    document.cookie = `cli_port=${port}; path=/; max-age=300; samesite=lax`;

    const supabase = getBrowserClient();
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }, [port]);

  if (!port || !/^\d+$/.test(port)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background font-sans">
        <p className="text-muted-foreground">
          Missing or invalid port. Please use{" "}
          <code className="font-mono">oathbound login</code> from your terminal.
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <p className="text-muted-foreground">Redirecting to Google sign-in...</p>
    </div>
  );
}

export default function CLILoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background font-sans">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <CLILoginInner />
    </Suspense>
  );
}
