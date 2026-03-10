import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase.server";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ExternalLink, FileCheck, ShieldCheck, ClipboardCheck } from "lucide-react";
import { getAdminClient } from "@/lib/supabase.admin";
import { Badge } from "@/components/ui/badge";
import { AuditForm } from "./audit-form";
import { CopyCommand } from "@/components/copy-command";

const IPFS_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ?? "https://gateway.pinata.cloud";

function ChainLink({ label, type, hash }: { label: string; type: "tx" | "object"; hash: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}:</span>
      <a
        href={`https://suiscan.xyz/testnet/${type}/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1 text-xs font-mono text-primary hover:underline"
      >
        <span className="truncate">{hash}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

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
      "id, name, namespace, description, license, version, compatibility, allowed_tools, created_at, user_id, sui_digest, sui_object_id, original_author"
    )
    .eq("id", id)
    .single();

  if (error || !skill) {
    notFound();
  }

  const { data: audits } = await supabase
    .from("audits")
    .select("id, ipfs_cid, passed, report_hash, audited_at, uploader, sui_digest, sui_object_id")
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

  // Look up author's identity verification (both use public.users.id)
  const admin = getAdminClient();
  const { data: authorVerification } = await admin
    .from("identity_verifications")
    .select("status, sui_digest, sui_object_id")
    .eq("user_id", skill.user_id)
    .single();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:max-w-4xl lg:gap-10 lg:py-12">
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {skill.namespace}/{skill.name} v{skill.version}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{skill.name}</h1>
          <CopyCommand command={`npx oathbound pull ${skill.namespace}/${skill.name}`} />
        </div>
        <p className="text-base text-muted-foreground sm:text-lg">{skill.description}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">by {skill.namespace}</Badge>
        {skill.original_author && (
          <Badge variant="outline">Original author: {skill.original_author}</Badge>
        )}
        <Badge variant="secondary">License: {skill.license}</Badge>
        {skill.compatibility && (
          <Badge variant="secondary" className="h-auto whitespace-normal">
            Compat: {skill.compatibility}
          </Badge>
        )}
        {skill.allowed_tools && <Badge variant="secondary">Tools: {skill.allowed_tools}</Badge>}
        {skill.created_at && (
          <Badge variant="secondary">
            Verified: {new Date(skill.created_at).toLocaleDateString()}
          </Badge>
        )}
      </div>

      <Card className="p-4">
        <h3 className="mb-1 text-sm font-medium">On-Chain Attestations</h3>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="skill-registration">
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-2">
                <FileCheck className="h-4 w-4 shrink-0 text-success" />
                <span className="text-success">Skill Registration</span>
                <span className="ml-auto">
                  {skill.sui_digest ? (
                    <Badge variant="outline">
                      Registered &middot; v{skill.version}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {skill.sui_digest || skill.sui_object_id ? (
                <div className="flex flex-col gap-2 pl-6">
                  {skill.sui_digest && (
                    <ChainLink label="Transaction" type="tx" hash={skill.sui_digest} />
                  )}
                  {skill.sui_object_id && (
                    <ChainLink label="Object" type="object" hash={skill.sui_object_id} />
                  )}
                </div>
              ) : (
                <p className="pl-6 text-xs text-muted-foreground">Not yet attested on-chain.</p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="author-identity">
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" />
                <span className="text-success">Author Verification</span>
                <span className="ml-auto">
                  {authorVerification?.status === "approved" ? (
                    <Badge variant="outline">Verified</Badge>
                  ) : (
                    <Badge variant="secondary">Not verified</Badge>
                  )}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {authorVerification?.status === "approved" ? (
                <div className="flex flex-col gap-2 pl-6">
                  {authorVerification.sui_digest && (
                    <ChainLink label="Transaction" type="tx" hash={authorVerification.sui_digest} />
                  )}
                  {authorVerification.sui_object_id && (
                    <ChainLink label="Object" type="object" hash={authorVerification.sui_object_id} />
                  )}
                </div>
              ) : (
                <p className="pl-6 text-xs text-muted-foreground">
                  Author has not completed identity verification.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="audits">
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-2">
                <ClipboardCheck className="h-4 w-4 shrink-0 text-success" />
                <span className="text-success">Audits</span>
                <span className="ml-auto">
                  {audits && audits.length > 0 ? (
                    <Badge variant="outline">
                      {audits.filter((a) => a.passed).length} Pass, {audits.filter((a) => !a.passed).length} Fail
                    </Badge>
                  ) : (
                    <Badge variant="secondary">None</Badge>
                  )}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {!audits || audits.length === 0 ? (
                <p className="pl-6 text-xs text-muted-foreground">No audits yet for this skill.</p>
              ) : (
                <div className="flex flex-col gap-4 pl-6">
                  {audits.map((audit) => (
                    <div key={audit.id} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">
                          {uploaderMap.get(audit.uploader) ?? "Unknown"}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            audit.passed
                              ? "bg-success/10 text-success"
                              : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                          }`}
                        >
                          {audit.passed ? "Pass" : "Fail"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{new Date(audit.audited_at).toLocaleDateString()}</span>
                        <a
                          href={`${IPFS_GATEWAY}/ipfs/${audit.ipfs_cid}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          View report
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      {(audit.sui_digest || audit.sui_object_id) && (
                        <div className="flex flex-col gap-1 border-t border-border pt-1.5">
                          {audit.sui_digest && (
                            <ChainLink label="Tx" type="tx" hash={audit.sui_digest} />
                          )}
                          {audit.sui_object_id && (
                            <ChainLink label="Object" type="object" hash={audit.sui_object_id} />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>

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
