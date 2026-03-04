import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";
import { validateUsername } from "@/lib/username";

export async function GET() {
  const supabase = await getServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("users")
    .select("username")
    .eq("user_id", user.id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "No username set" }, { status: 404 });
  }

  return NextResponse.json({ username: data.username });
}

export async function POST(request: Request) {
  const supabase = await getServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const username = validateUsername(body.username ?? "");
  const displayName =
    typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) || null : null;

  if (!username) {
    return NextResponse.json(
      {
        error:
          "Username must be 3-64 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens.",
      },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("users")
    .insert({ user_id: user.id, username, display_name: displayName })
    .select("username")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "Username already taken" },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { error: `Failed to create username: ${error.message}` },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ username: data.username });
  res.cookies.set("ob_username", data.username, {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
