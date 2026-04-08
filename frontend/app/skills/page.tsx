import Link from "next/link";
import { getServerClient } from "@/lib/supabase.server";
import { compareSemver } from "@/lib/semver";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, FileCheck, User, Lock, Download } from "lucide-react";

export const metadata = {
  title: 'Skills',
  description: 'Browse verified and audited skills for Claude Code.',
};

export default async function SkillsPage() {
  const supabase = await getServerClient();

  const { data: skills, error } = await supabase
    .from("skills")
    .select(
      `
      id, name, description, namespace, version, original_author, visibility,
      users (username, display_name, identity_verifications (status)),
      audits (id, passed)
    `
    )
    .eq("visibility", "public")
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

  // Collect all version IDs per namespace/name, then deduplicate to latest
  const allIdsByKey = new Map<string, string[]>();
  const seen = new Map<string, (typeof skills)[0]>();
  for (const skill of skills) {
    const key = `${skill.namespace}/${skill.name}`;
    const ids = allIdsByKey.get(key) ?? [];
    ids.push(skill.id);
    allIdsByKey.set(key, ids);
    const existing = seen.get(key);
    if (!existing || compareSemver(skill.version, existing.version) > 0) {
      seen.set(key, skill);
    }
  }
  const deduped = [...seen.values()];

  // Get download counts across ALL version IDs, mapped to deduplicated key
  const allSkillIds = skills.map((s) => s.id);
  const downloadCountMap = new Map<string, number>();
  if (allSkillIds.length > 0) {
    const { data: downloads } = await supabase
      .from("downloads")
      .select("skill_id")
      .in("skill_id", allSkillIds);

    const versionIdToLatestId = new Map<string, string>();
    for (const [key, ids] of allIdsByKey) {
      const latest = seen.get(key)!;
      for (const id of ids) {
        versionIdToLatestId.set(id, latest.id);
      }
    }

    for (const d of downloads ?? []) {
      if (d.skill_id) {
        const latestId = versionIdToLatestId.get(d.skill_id) ?? d.skill_id;
        downloadCountMap.set(latestId, (downloadCountMap.get(latestId) ?? 0) + 1);
      }
    }
  }

  // Sort by download count descending
  const latestSkills = deduped.sort(
    (a, b) => (downloadCountMap.get(b.id) ?? 0) - (downloadCountMap.get(a.id) ?? 0)
  );

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Skills</h1>

      {latestSkills.length === 0 ? (
        <p className="text-muted-foreground">No skills yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latestSkills.map((skill) => {
            const author = Array.isArray(skill.users)
              ? skill.users[0]
              : skill.users;
            const authorName =
              author?.display_name || author?.username || skill.namespace;

            const audits = skill.audits ?? [];
            const hasPassingAudit = audits.some((a) => a.passed);
            const hasAnyAudit = audits.length > 0;
            const downloads = downloadCountMap.get(skill.id) ?? 0;

            return (
              <Link key={skill.id} href={`/skills/${skill.id}`}>
                <Card className={`h-full transition-colors hover:bg-muted/50 ${skill.visibility === 'private' ? 'border-2 border-teal-500/50' : ''}`}>
                  <CardHeader>
                    <CardTitle>{skill.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {skill.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs font-mono text-muted-foreground">
                        {skill.namespace}/{skill.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldCheck className="size-3 text-success" />
                          <span className="font-medium text-foreground">
                            {authorName}
                          </span>
                        </span>

                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Download className="size-3" />
                          {downloads}
                        </span>

                        {skill.original_author && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <User className="size-3" />
                            <span>Originally by {skill.original_author}</span>
                          </span>
                        )}

                        {skill.visibility === 'private' && (
                          <Badge variant="outline" className="gap-1 border-teal-500/30 text-teal-600 dark:text-teal-400">
                            <Lock className="size-3" />
                            Private
                          </Badge>
                        )}

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
