import { renderOgImage } from "@/lib/og";
import { getAdminClient } from "@/lib/supabase.admin";

export const runtime = "nodejs";
export const alt = "Skill — Oathbound";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = getAdminClient();
  const { data: skill } = await admin
    .from("skills")
    .select("name, namespace, description")
    .eq("id", id)
    .single();

  if (!skill) {
    return renderOgImage({ title: "Skill Not Found" });
  }

  return renderOgImage({
    title: skill.name,
    description: skill.description ?? undefined,
    namespace: skill.namespace,
    category: "SKILL",
  });
}
