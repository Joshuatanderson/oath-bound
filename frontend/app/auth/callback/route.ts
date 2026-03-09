import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  // Read CLI port from cookie (set by /cli-login page)
  const cookies = request.headers.get("cookie") ?? "";
  const cliPortMatch = cookies.match(/(?:^|;\s*)cli_port=(\d+)/);
  const cliPort = cliPortMatch?.[1] ?? null;

  if (code) {
    const supabase = await getServerClient();
    const { data: sessionData, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // CLI login flow — redirect tokens to the CLI's localhost server
      // Uses client-side redirect to avoid Vercel edge stripping localhost redirects
      if (cliPort && sessionData?.session) {
        const { access_token, refresh_token, expires_at } =
          sessionData.session;
        const callbackUrl = new URL(
          `http://localhost:${cliPort}/callback`
        );
        callbackUrl.searchParams.set("access_token", access_token);
        callbackUrl.searchParams.set("refresh_token", refresh_token);
        callbackUrl.searchParams.set("expires_at", String(expires_at));
        const target = callbackUrl.toString();

        // Clear the cli_port cookie and return an HTML page that redirects client-side
        const html = `<!DOCTYPE html><html><head>
          <meta http-equiv="refresh" content="0;url=${target}">
          </head><body><p>Completing login...</p>
          <script>window.location.href=${JSON.stringify(target)}</script>
          </body></html>`;
        const res = new Response(html, {
          headers: { "Content-Type": "text/html" },
        });
        res.headers.append(
          "Set-Cookie",
          "cli_port=; Path=/; Max-Age=0"
        );
        return res;
      }

      // Normal web login flow
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data } = await supabase
          .from("users")
          .select("username")
          .eq("user_id", user.id)
          .single();

        if (data?.username) {
          const res = NextResponse.redirect(`${origin}/`);
          res.cookies.set("ob_username", data.username, {
            path: "/",
            httpOnly: false,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 60 * 60 * 24 * 365,
          });
          return res;
        }
      }

      // Signed in but no username — go to setup
      return NextResponse.redirect(`${origin}/setup`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
