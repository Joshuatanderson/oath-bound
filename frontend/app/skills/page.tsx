import Link from "next/link";
import { getServerClient } from "@/lib/supabase.server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileCheck } from "lucide-react";

export default async function SkillsPage() {
  const supabase = await getServerClient();

  const { data: skills, error } = await supabase
    .from("skills")
    .select(
      `
      id, name, description, namespace,
      users (username, display_name, identity_verifications (status)),
      audits (id, passed)
    `
    )
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <h1 className="text-4xl font-bold tracking-tight">Skills</h1>
        <p className="text-sm text-destructive">
          Failed to load skills: {error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Skills</h1>

      {skills.length === 0 ? (
        <p className="text-muted-foreground">No skills yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {skills.map((skill) => {
            const author = Array.isArray(skill.users)
              ? skill.users[0]
              : skill.users;
            const authorName =
              author?.display_name || author?.username || skill.namespace;

            const audits = skill.audits ?? [];
            const hasPassingAudit = audits.some((a) => a.passed);
            const hasAnyAudit = audits.length > 0;

            return (
              <Link key={skill.id} href={`/skills/${skill.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle>{skill.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {skill.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldCheck className="size-3 text-success" />
                        <span className="font-medium text-foreground">
                          {authorName}
                        </span>
                      </span>

                      {hasAnyAudit && (
                        <Badge
                          variant="outline"
                          className={
                            hasPassingAudit
                              ? "gap-1 border-success/30 text-success"
                              : "gap-1 border-destructive/30 text-destructive"
                          }
                        >
                          <FileCheck className="size-3" />
                          {hasPassingAudit ? "Audited" : "Audit Failed"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
