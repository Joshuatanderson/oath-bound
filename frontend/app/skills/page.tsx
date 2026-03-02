import Link from "next/link";
import { getServerClient } from "@/lib/supabase.server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

export default async function SkillsPage() {
  const supabase = await getServerClient();

  const { data: skills, error } = await supabase
    .from("skills")
    .select("id, name, description")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="flex min-h-screen items-start justify-center bg-background font-sans">
        <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-20">
          <h1 className="text-4xl font-bold tracking-tight">Skills</h1>
          <p className="text-sm text-destructive">
            Failed to load skills: {error.message}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-start justify-center bg-background font-sans">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-20">
        <h1 className="text-4xl font-bold tracking-tight">Skills</h1>

        {skills.length === 0 ? (
          <p className="text-muted-foreground">No skills yet.</p>
        ) : (
          <div className="flex flex-col gap-4">
            {skills.map((skill) => (
              <Link key={skill.id} href={`/skills/${skill.id}`}>
                <Card className="transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{skill.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {skill.description}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
