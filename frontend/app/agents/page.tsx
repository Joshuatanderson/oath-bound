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
import { ShieldCheck, Bot, Lock, Cpu, Shield } from "lucide-react";

export default async function AgentsPage() {
  const supabase = await getServerClient();

  const { data: agents, error } = await supabase
    .from("agents")
    .select(
      `
      id, name, description, namespace, version, visibility,
      model, tools, permission_mode, effort,
      users (username, display_name, identity_verifications (status))
    `
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) {
    return (
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
        <h1 className="text-4xl font-bold tracking-tight">Agents</h1>
        <p className="text-sm text-destructive">
          Failed to load agents: {error.message}
        </p>
      </main>
    );
  }

  // Deduplicate to latest version per agent
  const seen = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = `${agent.namespace}/${agent.name}`;
    const existing = seen.get(key);
    if (!existing || compareSemver(agent.version, existing.version) > 0) {
      seen.set(key, agent);
    }
  }
  const latestAgents = [...seen.values()];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold tracking-tight">Agents</h1>
        <p className="text-muted-foreground">
          Claude Code subagent configurations — verified behavioral constraints
          and system prompts.
        </p>
      </div>

      {latestAgents.length === 0 ? (
        <p className="text-muted-foreground">No agents yet.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {latestAgents.map((agent) => {
            const author = Array.isArray(agent.users)
              ? agent.users[0]
              : agent.users;
            const authorName =
              author?.display_name || author?.username || agent.namespace;

            return (
              <Link key={agent.id} href={`/agents/${agent.id}`}>
                <Card className="h-full transition-colors hover:bg-muted/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="size-5 shrink-0 text-muted-foreground" />
                      {agent.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {agent.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col gap-1.5">
                      <p className="font-mono text-xs text-muted-foreground">
                        {agent.namespace}/{agent.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <ShieldCheck className="size-3 text-success" />
                          <span className="font-medium text-foreground">
                            {authorName}
                          </span>
                        </span>

                        {agent.visibility === "private" && (
                          <Badge
                            variant="outline"
                            className="gap-1 border-teal-500/30 text-teal-600 dark:text-teal-400"
                          >
                            <Lock className="size-3" />
                            Private
                          </Badge>
                        )}

                        {agent.model && (
                          <Badge variant="secondary" className="gap-1">
                            <Cpu className="size-3" />
                            {agent.model}
                          </Badge>
                        )}

                        {agent.permission_mode &&
                          agent.permission_mode !== "default" && (
                            <Badge variant="secondary" className="gap-1">
                              <Shield className="size-3" />
                              {agent.permission_mode}
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
