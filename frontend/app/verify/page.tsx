"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShieldCheck, ShieldX, ArrowLeft } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase.client";

const supabase = getBrowserClient();

type VerifyState = "loading" | "ready" | "verifying" | "approved" | "declined" | "error";

export default function VerifyPage() {
  return (
    <Suspense fallback={
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-6 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    }>
      <VerifyContent />
    </Suspense>
  );
}

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/";
  const [state, setState] = useState<VerifyState>("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [bypassAvailable, setBypassAvailable] = useState(false);
  const [bypassPassword, setBypassPassword] = useState("");
  const [bypassLoading, setBypassLoading] = useState(false);

  // On mount: check auth + verification status
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }
      setUserId(data.user.id);

      fetch("/api/verify/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!d) {
            setState("ready");
            return;
          }
          if (d.bypassAvailable) setBypassAvailable(true);
          if (d.verified) {
            router.replace(returnTo);
            return;
          }
          if (d.verificationStatus === "declined") {
            setState("declined");
            return;
          }
          setState("ready");
        })
        .catch(() => setState("ready"));
    });
  }, [router]);

  const startVerification = useCallback(async () => {
    if (!userId) return;
    setState("verifying");
    setErrorMsg(null);

    try {
      // Dynamic import to avoid SSR issues
      const { Client: PersonaClient } = await import("persona");

      const templateId = process.env.NEXT_PUBLIC_PERSONA_TEMPLATE_ID;
      const environmentId = process.env.NEXT_PUBLIC_PERSONA_ENVIRONMENT_ID;

      if (!templateId || !environmentId) {
        setErrorMsg("Persona configuration missing. Contact support.");
        setState("error");
        return;
      }

      const client = new PersonaClient({
        templateId,
        environmentId,
        referenceId: userId,
        onComplete: async ({ inquiryId }: { inquiryId: string }) => {
          try {
            const res = await fetch("/api/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inquiryId }),
            });
            const data = await res.json();

            if (!res.ok) {
              setErrorMsg(data.error ?? "Verification failed");
              setState("error");
              return;
            }

            if (data.status === "approved") {
              setState("approved");
              router.replace(returnTo);
            } else if (data.status === "declined") {
              setState("declined");
            } else {
              // Pending or other — show as error with retry
              setErrorMsg("Verification is still processing. Please try again in a moment.");
              setState("error");
            }
          } catch {
            setErrorMsg("Network error confirming verification. Please try again.");
            setState("error");
          }
        },
        onCancel: () => {
          setState("ready");
        },
        onError: (error: unknown) => {
          console.error("Persona error:", error);
          setErrorMsg("Verification encountered an error. Please try again.");
          setState("error");
        },
      });

      client.open();
    } catch (err) {
      console.error("Failed to load Persona SDK:", err);
      setErrorMsg("Failed to load verification. Please refresh and try again.");
      setState("error");
    }
  }, [userId, router]);

  const submitBypass = useCallback(async () => {
    setBypassLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/verify/bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: bypassPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error ?? "Bypass verification failed");
        setState("error");
        return;
      }

      if (data.status === "approved") {
        setState("approved");
        router.replace(returnTo);
      }
    } catch {
      setErrorMsg("Network error. Please try again.");
      setState("error");
    } finally {
      setBypassLoading(false);
    }
  }, [bypassPassword, router, returnTo]);

  if (state === "loading") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col items-center gap-6 px-6 py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Verify your identity
        </h1>
        <p className="text-sm text-muted-foreground">
          A one-time check using a government-issued ID and a selfie.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Who needs this?</h2>
          <p className="text-sm text-muted-foreground">
            Anyone who wants to publish skills or submit audits. Browsing the
            platform does not require verification.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">What we store</h2>
          <p className="text-sm text-muted-foreground">
            We never store your ID on our servers. We only keep a hash to
            confirm your identity was verified.
          </p>
        </div>
      </div>

      {state === "approved" && (
        <div className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 p-4">
          <ShieldCheck className="h-5 w-5 text-success" />
          <p className="text-sm text-success">
            Identity verified! Redirecting...
          </p>
        </div>
      )}

      {state === "declined" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <ShieldX className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">
              Verification was not approved. You can try again with a different
              document.
            </p>
          </div>
          <Button size="lg" onClick={startVerification}>
            Try again
          </Button>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <ShieldX className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">
              {errorMsg ?? "Something went wrong."}
            </p>
          </div>
          <Button size="lg" onClick={startVerification}>
            Try again
          </Button>
        </div>
      )}

      {state === "ready" && (
        <>
          <Button size="lg" disabled className="opacity-50 cursor-not-allowed">
            Start verification
          </Button>
          <p className="text-xs text-muted-foreground -mt-2">
            Automated verification is temporarily unavailable. Contact us directly for onboarding.
          </p>

          {bypassAvailable && (
            <div className="flex flex-col gap-3 border-t pt-6">
              <h2 className="text-sm font-medium">Founder access</h2>
              <p className="text-sm text-muted-foreground">
                If you were given a founder password, enter it here to skip ID
                verification.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="Password"
                  value={bypassPassword}
                  onChange={(e) => setBypassPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && bypassPassword) submitBypass();
                  }}
                />
                <Button
                  onClick={submitBypass}
                  disabled={!bypassPassword || bypassLoading}
                >
                  {bypassLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Verify"
                  )}
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {state === "verifying" && (
        <div className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Verification in progress...
          </p>
        </div>
      )}

      <Button variant="ghost" size="sm" className="self-start" onClick={() => router.push("/")}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to home
      </Button>
    </main>
  );
}
