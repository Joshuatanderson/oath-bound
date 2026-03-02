import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim().toLowerCase() ?? "";

  if (q.length < 3) {
    return NextResponse.json(
      { error: "Username must be at least 3 characters" },
      { status: 400 }
    );
  }

  const supabase = await getServerClient();

  const { data } = await supabase
    .from("users")
    .select("username")
    .eq("username", q)
    .single();

  return NextResponse.json({ available: !data });
}
