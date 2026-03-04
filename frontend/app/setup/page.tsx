"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check, X, Loader2 } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase.client";
import { USERNAME_RE } from "@/lib/username";

const supabase = getBrowserClient();

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [usernameInput, setUsernameInput] = useState("");
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [displayName, setDisplayName] = useState("");

  // On mount: if not signed in, go to /login. If already has username, go to /.
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login");
        return;
      }

      fetch("/api/username")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.username) {
            router.replace("/");
            return;
          }
          setLoading(false);
        })
        .catch(() => setLoading(false));
    });
  }, [router]);

  // Debounced availability check
  useEffect(() => {
    setUsernameAvailable(null);
    setUsernameError(null);

    const trimmed = usernameInput.trim().toLowerCase();
    if (trimmed.length < 3 || !USERNAME_RE.test(trimmed)) return;

    setUsernameChecking(true);
    const timer = setTimeout(() => {
      fetch(`/api/username/check?q=${encodeURIComponent(trimmed)}`)
        .then((r) => r.json())
        .then((d) => setUsernameAvailable(d.available ?? false))
        .catch(() => setUsernameAvailable(null))
        .finally(() => setUsernameChecking(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      setUsernameChecking(false);
    };
  }, [usernameInput]);

  async function claimUsername() {
    const trimmed = usernameInput.trim().toLowerCase();
    if (!USERNAME_RE.test(trimmed) || !usernameAvailable) return;

    setClaiming(true);
    setUsernameError(null);

    try {
      const res = await fetch("/api/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmed,
          displayName: displayName.trim() || null,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setUsernameError(data.error ?? "Failed to claim username");
        setClaiming(false);
        return;
      }

      router.replace("/");
    } catch {
      setUsernameError("Network error — please try again");
    }

    setClaiming(false);
  }

  if (loading) {
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
          Choose a username
        </h1>
        <p className="text-sm text-muted-foreground">
          Your username is your namespace for publishing skills. It can&apos;t be
          changed later.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="username-input">Username</Label>
        <div className="relative">
          <Input
            id="username-input"
            value={usernameInput}
            onChange={(e) =>
              setUsernameInput(
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
              )
            }
            placeholder="my-username"
            maxLength={64}
            className="pr-10"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {usernameChecking && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {!usernameChecking && usernameAvailable === true && (
              <Check className="h-4 w-4 text-success" />
            )}
            {!usernameChecking && usernameAvailable === false && (
              <X className="h-4 w-4 text-destructive" />
            )}
          </div>
        </div>
        {usernameAvailable === false && (
          <p className="text-xs text-destructive">Username taken</p>
        )}
        {usernameInput.length > 0 && usernameInput.length < 3 && (
          <p className="text-xs text-muted-foreground">
            Must be at least 3 characters
          </p>
        )}
        {usernameInput.length >= 3 && !USERNAME_RE.test(usernameInput) && (
          <p className="text-xs text-destructive">
            Must start with a letter and contain only lowercase letters, numbers,
            and hyphens
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Lowercase letters, numbers, and hyphens. 3-64 characters.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="display-name">Display name (optional)</Label>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Jane Doe"
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">
          Shown alongside your username. You can change this later.
        </p>
      </div>

      {usernameError && (
        <p className="text-sm text-destructive">{usernameError}</p>
      )}

      <div className="flex gap-3">
        <Button
          size="lg"
          disabled={!USERNAME_RE.test(usernameInput) || !usernameAvailable || claiming}
          onClick={claimUsername}
        >
          {claiming ? "Claiming..." : "Claim username"}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          onClick={async () => {
            await supabase.auth.signOut();
            document.cookie = "ob_username=; path=/; max-age=0";
            window.location.href = "/";
          }}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}
