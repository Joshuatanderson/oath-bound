import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase.server";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { ExternalLink } from "lucide-react";
import { AuditForm } from "./audit-form";
import { CopyCommand } from "./copy-command";

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";

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
      "id, name, namespace, description, license, version, compatibility, allowed_tools, created_at, user_id, sui_digest, sui_object_id"
    )
    .eq("id", id)
    .single();

  if (error || !skill) {
    notFound();
  }

  const { data: audits } = await supabase
    .from("audits")
    .select("id, ipfs_cid, passed, report_hash, audited_at, uploader")
    .eq("skill_id", id)
    .order("audited_at", { ascending: false });

  // Look up uploader usernames
  const uploaderIds = [...new Set(audits?.map((a) => a.uploader) ?? [])];
  const { data: uploaderUsers } = uploaderIds.length
    ? await supabase
        .from("users")
        .select("user_id, username, display_name")
        .in("user_id", uploaderIds)
    : { data: [] };

  const uploaderMap = new Map(
    (uploaderUsers ?? []).map((u) => [
      u.user_id,
      u.display_name || u.username,
    ])
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Only auditors can submit audits
  let isAuditor = false;
  if (user) {
    const { data: userRecord } = await supabase
      .from("users")
      .select("id, role")
      .eq("user_id", user.id)
      .single();
    isAuditor = userRecord?.role === "AUDITOR";
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {skill.namespace}/{skill.name} v{skill.version}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-4xl font-bold tracking-tight">{skill.name}</h1>
          <CopyCommand command={`oathbound ${skill.namespace}/${skill.name}`} />
        </div>
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

      {(skill.sui_digest || skill.sui_object_id) && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="mb-3 text-sm font-medium">On-Chain Attestation</h3>
          <div className="flex flex-col gap-2">
            {skill.sui_digest && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Transaction:</span>
                <a
                  href={`https://suiscan.xyz/testnet/tx/${skill.sui_digest}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                >
                  {skill.sui_digest}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
            {skill.sui_object_id && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Object:</span>
                <a
                  href={`https://suiscan.xyz/testnet/object/${skill.sui_object_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-mono text-primary hover:underline"
                >
                  {skill.sui_object_id}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

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
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {uploaderMap.get(audit.uploader) ?? "Unknown"}
                    </CardTitle>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        audit.passed
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}
                    >
                      {audit.passed ? "Pass" : "Fail"}
                    </span>
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    <span>
                      {new Date(audit.audited_at).toLocaleDateString()}
                    </span>
                    <a
                      href={`${IPFS_GATEWAY}/ipfs/${audit.ipfs_cid}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View report
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}
      </section>

      {isAuditor && (
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
