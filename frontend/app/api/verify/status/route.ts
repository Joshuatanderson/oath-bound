import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";
import { getAdminClient } from "@/lib/supabase.admin";

export async function GET() {
  const supabase = await getServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if user has a username (also gives us public user ID)
  const { data: userData } = await supabase
    .from("users")
    .select("id, username")
    .eq("user_id", user.id)
    .single();

  // Check verification status using public user ID
  const admin = getAdminClient();
  const { data: verification } = userData
    ? await admin
        .from("identity_verifications")
        .select("status")
        .eq("user_id", userData.id)
        .single()
    : { data: null };

  return NextResponse.json({
    verified: verification?.status === "approved",
    verificationStatus: verification?.status ?? null,
    hasUsername: !!userData?.username,
    bypassAvailable: !!process.env.FOUNDER_BYPASS_PASSWORD,
  });
}
