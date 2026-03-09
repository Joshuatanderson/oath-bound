import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const cliPort = searchParams.get("cli_port");

  if (code) {
    const supabase = await getServerClient();
    const { data: sessionData, error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // CLI login flow — redirect tokens to the CLI's localhost server
      if (cliPort && /^\d+$/.test(cliPort) && sessionData?.session) {
        const { access_token, refresh_token, expires_at } =
          sessionData.session;
        const callbackUrl = new URL(
          `http://localhost:${cliPort}/callback`
        );
        callbackUrl.searchParams.set("access_token", access_token);
        callbackUrl.searchParams.set("refresh_token", refresh_token);
        callbackUrl.searchParams.set("expires_at", String(expires_at));
        return NextResponse.redirect(callbackUrl.toString());
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
