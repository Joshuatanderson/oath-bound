"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase.client";
import type { User } from "@supabase/supabase-js";

const supabase = getBrowserClient();

export function SiteHeader() {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const match = document.cookie.match(/(?:^|; )ob_username=([^;]*)/);
    if (match) setUsername(decodeURIComponent(match[1]));
  }, []);

  return (
    <header className="fixed top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 w-full items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/oathbound-teal-v3.svg"
              alt=""
              width={28}
              height={28}
              className="shrink-0"
            />
            <span className="text-lg font-bold tracking-tight">Oathbound</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/skills"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Skills
            </Link>
            <Link
              href="/agents"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Agents
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-border">
                    <AvatarImage
                      src={user.user_metadata?.avatar_url}
                      alt={user.user_metadata?.full_name ?? "User"}
                    />
                    <AvatarFallback>
                      {user.email?.charAt(0).toUpperCase() ?? "?"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="font-normal">
                  <p className="text-sm font-medium truncate">
                    {user.user_metadata?.full_name ?? "User"}
                  </p>
                  {username && (
                    <p className="text-xs text-muted-foreground truncate">
                      @{username}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await supabase.auth.signOut();
                    document.cookie = "ob_username=; path=/; max-age=0";
                    window.location.href = "/";
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: {
                    redirectTo: `${window.location.origin}/auth/callback`,
                  },
                })
              }
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
