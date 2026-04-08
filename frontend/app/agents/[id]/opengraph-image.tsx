import { renderOgImage } from "@/lib/og";
import { getAdminClient } from "@/lib/supabase.admin";

export const runtime = "nodejs";
export const alt = "Agent — Oathbound";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const { data: agent } = await admin
    .from("agents")
    .select("name, namespace, description")
    .eq("id", id)
    .single();

  if (!agent) {
    return renderOgImage({ title: "Agent Not Found" });
  }

  return renderOgImage({
    title: agent.name,
    description: agent.description ?? undefined,
    namespace: agent.namespace,
    category: "AGENT",
  });
}
