import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await getServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
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
