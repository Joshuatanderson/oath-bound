import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase.server";

export default async function SkillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();

  const { data: skill, error } = await supabase
    .from("skills")
    .select("id, name, description")
    .eq("id", id)
    .single();

  if (error || !skill) {
    notFound();
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background font-sans">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-20">
        <h1 className="text-4xl font-bold tracking-tight">{skill.name}</h1>
        <p className="text-lg text-muted-foreground">{skill.description}</p>
      </main>
    </div>
  );
}
