import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase.server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AuditForm } from "./audit-form";

export default async function SkillPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();

  const { data: skill, error } = await supabase
    .from("skills")
    .select(
      "id, name, namespace, description, license, version, compatibility, allowed_tools, created_at, user_id"
    )
    .eq("id", id)
    .single();

  if (error || !skill) {
    notFound();
  }

  const { data: audits } = await supabase
    .from("audits")
    .select("id, auditor_name, report_path, audited_at")
    .eq("skill_id", id)
    .order("audited_at", { ascending: false });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Check if the current user has a profile (needed to show audit form)
  let hasProfile = false;
  if (user) {
    const { data: userRecord } = await supabase
      .from("users")
      .select("id")
      .eq("user_id", user.id)
      .single();
    hasProfile = !!userRecord;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {skill.namespace}/{skill.name} v{skill.version}
        </p>
        <h1 className="text-4xl font-bold tracking-tight">{skill.name}</h1>
        <p className="text-lg text-muted-foreground">{skill.description}</p>
      </div>

      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
        <span>License: {skill.license}</span>
        {skill.compatibility && <span>Compat: {skill.compatibility}</span>}
        {skill.allowed_tools && <span>Tools: {skill.allowed_tools}</span>}
        {skill.created_at && (
          <span>
            Created: {new Date(skill.created_at).toLocaleDateString()}
          </span>
        )}
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">Audits</h2>

        {!audits || audits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No audits yet for this skill.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {audits.map((audit) => (
              <Card key={audit.id}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {audit.auditor_name}
                  </CardTitle>
                  <CardDescription>
                    {new Date(audit.audited_at).toLocaleDateString()}
                    {audit.report_path && (
                      <>
                        {" — "}
                        <a
                          href={audit.report_path}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          Report
                        </a>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      {user && hasProfile && (
        <section className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold tracking-tight">
            Add an Audit
          </h2>
          <AuditForm skillId={skill.id} />
        </section>
      )}
    </main>
  );
}
