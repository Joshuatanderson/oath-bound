"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserClient } from "@/lib/supabase.client";

function CLILoginInner() {
  const searchParams = useSearchParams();
  const port = searchParams.get("port");
  const [status, setStatus] = useState("Checking session...");

  useEffect(() => {
    if (!port || !/^\d+$/.test(port)) return;

    document.cookie = `cli_port=${port}; path=/; max-age=300; samesite=lax`;

    const supabase = getBrowserClient();

    // First check if the user already has a session (already logged in)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token && session?.refresh_token) {
        setStatus("Redirecting to CLI...");
        redirectToCLI(port, session);
      } else {
        // No session — need to log in via Google OAuth
        setStatus("Redirecting to Google sign-in...");
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
      }
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
      <p className="text-muted-foreground">{status}</p>
    </div>
  );
}

function redirectToCLI(
  port: string,
  session: { access_token: string; refresh_token: string; expires_at?: number }
) {
  const callbackUrl = new URL(`http://localhost:${port}/callback`);
  callbackUrl.searchParams.set("access_token", session.access_token);
  callbackUrl.searchParams.set("refresh_token", session.refresh_token);
  callbackUrl.searchParams.set("expires_at", String(session.expires_at ?? 0));
  document.cookie = "cli_port=; path=/; max-age=0";
  window.location.href = callbackUrl.toString();
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
