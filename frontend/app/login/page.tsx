"use client";

import { getBrowserClient } from "@/lib/supabase.client";
import { Button } from "@/components/ui/button";

const supabase = getBrowserClient();

export default function LoginPage() {
  function handleSignIn() {
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-sans">
      <div className="flex w-full max-w-sm flex-col items-center gap-8 px-6">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-3xl font-bold tracking-tight">Oathbound</h1>
          <p className="text-sm text-muted-foreground text-center">
            Sign in to attest your skills on-chain.
          </p>
        </div>
        <Button size="lg" className="w-full" onClick={handleSignIn}>
          Sign in with Google
        </Button>
      </div>
    </div>
  );
}
