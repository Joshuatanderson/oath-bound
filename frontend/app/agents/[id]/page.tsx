import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerClient } from "@/lib/supabase.server";
import { getAdminClient } from "@/lib/supabase.admin";
import { compareSemver } from "@/lib/semver";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { CopyCommand } from "@/components/copy-command";
import {
  ExternalLink,
  FileCheck,
  ShieldCheck,
  Bot,
  Lock,
  AlertTriangle,
  User,
} from "lucide-react";

function ChainLink({
  label,
  type,
  hash,
}: {
  label: string;
  type: "tx" | "object";
  hash: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 text-xs text-muted-foreground">{label}:</span>
      <a
        href={`https://suiscan.xyz/testnet/${type}/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1 font-mono text-xs text-primary hover:underline"
      >
        <span className="truncate">{hash}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </a>
    </div>
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const admin = getAdminClient();
  const { data: agent } = await admin
    .from("agents")
    .select("name, namespace, description")
    .eq("id", id)
    .single();

  if (!agent) return { title: "Agent Not Found" };

  return {
    title: `${agent.name} by ${agent.namespace}`,
    description: agent.description?.slice(0, 160),
  };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getServerClient();

  const { data: agent, error } = await supabase
    .from("agents")
    .select(
      `id, name, namespace, description, license, version, visibility,
       tools, disallowed_tools, model, permission_mode, max_turns,
       memory_scope, background, effort, isolation, config,
       system_prompt, compatibility, original_author,
       created_at, user_id, sui_digest, sui_object_id, content_hash`
    )
    .eq("id", id)
    .single();

  if (error || !agent) {
    notFound();
  }

  // Fetch all versions
  const { data: allVersionsRaw } = await supabase
    .from("agents")
    .select("id, version, created_at")
    .eq("namespace", agent.namespace)
    .eq("name", agent.name);

  const allVersions = allVersionsRaw?.sort((a, b) =>
    compareSemver(b.version, a.version)
  );

  const isLatest = allVersions?.[0]?.id === agent.id;

  // Look up author's identity verification
  const admin = getAdminClient();
  const { data: authorVerification } = await admin
    .from("identity_verifications")
    .select("status, sui_digest, sui_object_id")
    .eq("user_id", agent.user_id)
    .single();

  const config = agent.config as Record<string, unknown> | null;
  const hooks = config?.hooks;
  const mcpServers = config?.mcpServers;
  const skillsRefs = config?.skillsRefs as string[] | undefined;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 overflow-hidden px-4 py-8 sm:px-6 sm:py-10 lg:max-w-4xl lg:gap-10 lg:py-12">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {agent.namespace}/{agent.name} v{agent.version}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex items-center gap-3 text-3xl font-bold tracking-tight sm:text-4xl">
            <Bot className="size-8 shrink-0 text-muted-foreground" />
            {agent.name}
          </h1>
          <CopyCommand
            command={`npx oathbound agent pull ${agent.namespace}/${agent.name}${isLatest ? "" : `@${agent.version}`}`}
          />
        </div>
        <p className="text-base text-muted-foreground sm:text-lg">
          {agent.description}
        </p>
      </div>

      {/* Metadata badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="size-3 text-success" />
          {agent.namespace}
        </Badge>
        {agent.visibility === "private" && (
          <Badge
            variant="outline"
            className="gap-1 border-teal-500/30 text-teal-600 dark:text-teal-400"
          >
            <Lock className="size-3" />
            Private
          </Badge>
        )}
        {agent.original_author && (
          <Badge variant="outline" className="gap-1">
            <User className="size-3" />
            Originally by {agent.original_author}
          </Badge>
        )}
        <Badge variant="secondary">License: {agent.license}</Badge>
        {agent.model && <Badge variant="secondary">Model: {agent.model}</Badge>}
        {agent.permission_mode && (
          <Badge variant="secondary">Mode: {agent.permission_mode}</Badge>
        )}
        {agent.effort && (
          <Badge variant="secondary">Effort: {agent.effort}</Badge>
        )}
        {agent.max_turns && (
          <Badge variant="secondary">Max turns: {agent.max_turns}</Badge>
        )}
        {agent.memory_scope && (
          <Badge variant="secondary">Memory: {agent.memory_scope}</Badge>
        )}
        {agent.isolation && (
          <Badge variant="secondary">Isolation: {agent.isolation}</Badge>
        )}
        {agent.background && <Badge variant="secondary">Background</Badge>}
        {agent.compatibility && (
          <Badge variant="secondary" className="h-auto whitespace-normal">
            Compat: {agent.compatibility}
          </Badge>
        )}
        {agent.created_at && (
          <Badge variant="secondary">
            Published: {new Date(agent.created_at).toLocaleDateString()}
          </Badge>
        )}
      </div>

      {/* Security-relevant config (hooks, mcpServers, tools) — surfaced prominently */}
      {(hooks || mcpServers || agent.tools || agent.disallowed_tools) && (
        <Card className="border-yellow-500/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-4 text-yellow-500" />
            <h3 className="text-sm font-medium">
              Security-Relevant Configuration
            </h3>
          </div>
          <div className="flex flex-col gap-3">
            {agent.tools && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Allowed Tools
                </p>
                <p className="font-mono text-xs">{agent.tools}</p>
              </div>
            )}
            {agent.disallowed_tools && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Disallowed Tools
                </p>
                <p className="font-mono text-xs">{agent.disallowed_tools}</p>
              </div>
            )}
            {hooks && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  Hooks
                </p>
                <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                  {JSON.stringify(hooks, null, 2)}
                </pre>
              </div>
            )}
            {mcpServers && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">
                  MCP Servers
                </p>
                <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-xs">
                  {JSON.stringify(mcpServers, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Skills references */}
      {skillsRefs && skillsRefs.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-muted-foreground">
            Referenced Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {skillsRefs.map((ref) => (
              <Badge key={ref} variant="outline" className="font-mono">
                {ref}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Version history */}
      {allVersions && allVersions.length > 1 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted-foreground">
            Version History
          </h3>
          <div className="flex flex-wrap gap-2">
            {allVersions.map((v) => (
              <Link
                key={v.id}
                href={`/agents/${v.id}`}
                className={`text-sm ${v.id === agent.id ? "font-bold text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                v{v.version}
                {v.id === allVersions[0].id && " (latest)"}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* System prompt */}
      <div>
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          System Prompt
        </h3>
        <Card className="p-4">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
            {agent.system_prompt}
          </pre>
        </Card>
      </div>

      {/* Content hash */}
      <div>
        <p className="text-xs text-muted-foreground">
          Content hash:{" "}
          <span className="font-mono">{agent.content_hash}</span>
        </p>
      </div>

      {/* On-chain attestations */}
      <Card className="p-4">
        <h3 className="mb-1 text-sm font-medium">On-Chain Attestations</h3>
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="agent-registration">
            <AccordionTrigger>
              <div className="flex flex-1 items-center gap-2">
                <FileCheck className="h-4 w-4 shrink-0 text-success" />
                <span className="text-success">Agent Registration</span>
                <span className="ml-auto">
                  {agent.sui_digest ? (
                    <Badge variant="outline">
                      Registered &middot; v{agent.version}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Pending</Badge>
                  )}
                </span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              {agent.sui_digest || agent.sui_object_id ? (
                <div className="flex flex-col gap-2 pl-6">
                  {agent.sui_digest && (
                    <ChainLink
                      label="Transaction"
                      type="tx"
                      hash={agent.sui_digest}
                    />
                  )}
                  {agent.sui_object_id && (
                    <ChainLink
                      label="Object"
                      type="object"
                      hash={agent.sui_object_id}
                    />
                  )}
                </div>
              ) : (
                <p className="pl-6 text-xs text-muted-foreground">
                  Not yet attested on-chain.
                </p>
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
                    <ChainLink
                      label="Transaction"
                      type="tx"
                      hash={authorVerification.sui_digest}
                    />
                  )}
                  {authorVerification.sui_object_id && (
                    <ChainLink
                      label="Object"
                      type="object"
                      hash={authorVerification.sui_object_id}
                    />
                  )}
                </div>
              ) : (
                <p className="pl-6 text-xs text-muted-foreground">
                  Author has not completed identity verification.
                </p>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Card>
    </main>
  );
}
