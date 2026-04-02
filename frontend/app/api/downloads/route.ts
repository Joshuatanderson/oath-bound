import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabase.admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^[a-zA-Z0-9.\-_+]{1,64}$/;

export async function POST(request: Request) {
  const admin = getAdminClient();

  let body: { skill_id?: string; agent_id?: string; version: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const { skill_id, agent_id, version } = body;

  if (!version || !VERSION_RE.test(version)) {
    return NextResponse.json(
      { error: "Invalid or missing version" },
      { status: 400 }
    );
  }

  if ((!skill_id && !agent_id) || (skill_id && agent_id)) {
    return NextResponse.json(
      { error: "Exactly one of skill_id or agent_id is required" },
      { status: 400 }
    );
  }

  // Validate UUID format before querying
  if (skill_id && !UUID_RE.test(skill_id)) {
    return NextResponse.json({ error: "Invalid skill_id" }, { status: 400 });
  }
  if (agent_id && !UUID_RE.test(agent_id)) {
    return NextResponse.json({ error: "Invalid agent_id" }, { status: 400 });
  }

  // Validate the referenced entity exists
  if (skill_id) {
    const { data } = await admin
      .from("skills")
      .select("id")
      .eq("id", skill_id)
      .single();
    if (!data) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
  } else {
    const { data } = await admin
      .from("agents")
      .select("id")
      .eq("id", agent_id!)
      .single();
    if (!data) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }
  }

  const { error } = await admin.from("downloads").insert({
    skill_id: skill_id ?? null,
    agent_id: agent_id ?? null,
    version,
  });

  if (error) {
    console.error("[downloads] insert failed:", error.message);
    return NextResponse.json(
      { error: "Failed to record download" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
