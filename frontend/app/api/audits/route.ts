import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";

interface AuditSubmission {
  skill_id: string;
  auditor_name: string;
  report_path?: string;
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

  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (userError || !userRecord) {
    return NextResponse.json(
      { error: "User profile not found. Please set up your username first." },
      { status: 400 }
    );
  }

  const body: AuditSubmission = await request.json();

  if (!body.skill_id || !body.auditor_name) {
    return NextResponse.json(
      { error: "skill_id and auditor_name are required" },
      { status: 400 }
    );
  }

  const { error: insertError } = await supabase.from("audits").insert({
    skill_id: body.skill_id,
    auditor_name: body.auditor_name,
    report_path: body.report_path || null,
    uploader: userRecord.id,
  });

  if (insertError) {
    // Surface the DB trigger error clearly
    if (insertError.message.includes("Auditor cannot be the skill author")) {
      return NextResponse.json(
        { error: "You cannot audit your own skill." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: `Failed to save audit: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
