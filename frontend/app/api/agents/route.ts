import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { getServerClient } from "@/lib/supabase.server";
import { getAdminClient } from "@/lib/supabase.admin";
import {
  validateAgent,
  serializeAgentFile,
  agentToMeta,
} from "@/lib/agent-validator";
import { isValidSemver, compareSemver, bumpPatch } from "@/lib/semver";
import { registerAgent, ensureChainWrite } from "@/lib/sui";
import type { Database, Json } from "@/lib/database.types";

/** Escape ILIKE wildcards in user input. */
function escapeIlike(str: string): string {
  return str.replace(/%/g, "\\%").replace(/_/g, "\\_");
}

// ---------------------------------------------------------------------------
// GET /api/agents — search/list
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const admin = getAdminClient();
  const { searchParams } = new URL(request.url);

  const q = searchParams.get("q")?.trim() ?? "";
  const namespace = searchParams.get("namespace")?.trim() ?? "";
  const sparse = searchParams.get("sparse") === "true";
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1),
    100
  );
  const offset = Math.max(
    parseInt(searchParams.get("offset") ?? "0", 10) || 0,
    0
  );

  let query = admin
    .from("agents")
    .select(
      `
      id, name, description, namespace, version, license, visibility,
      model, tools, permission_mode, effort,
      users (username, display_name, identity_verifications (status))
    `
    )
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (namespace) {
    query = query.eq("namespace", namespace);
  }

  if (q) {
    const escaped = escapeIlike(q);
    query = query.or(
      `name.ilike.%${escaped}%,description.ilike.%${escaped}%`
    );
  }

  const { data: agents, error } = await query;

  if (error) {
    return NextResponse.json(
      { error: `Query failed: ${error.message}` },
      { status: 500 }
    );
  }

  // Deduplicate to latest version per namespace/name
  const seen = new Map<string, (typeof agents)[0]>();
  for (const agent of agents) {
    const key = `${agent.namespace}/${agent.name}`;
    const existing = seen.get(key);
    if (!existing || compareSemver(agent.version, existing.version) > 0) {
      seen.set(key, agent);
    }
  }
  const deduped = [...seen.values()];
  const total = deduped.length;

  // Paginate
  const page = deduped.slice(offset, offset + limit);

  // Shape response
  const shaped = page.map((agent) => {
    if (sparse) {
      return {
        name: agent.name,
        namespace: agent.namespace,
        description: agent.description,
        version: agent.version,
      };
    }

    const author = Array.isArray(agent.users)
      ? agent.users[0]
      : agent.users;

    return {
      name: agent.name,
      namespace: agent.namespace,
      description: agent.description,
      version: agent.version,
      license: agent.license,
      visibility: agent.visibility,
      model: agent.model,
      tools: agent.tools,
      permission_mode: agent.permission_mode,
      effort: agent.effort,
      author: author
        ? {
            username: author.username,
            display_name: author.display_name,
            verified: Array.isArray(author.identity_verifications)
              ? author.identity_verifications.some(
                  (v: { status: string }) => v.status === "approved"
                )
              : (
                  author.identity_verifications as {
                    status: string;
                  } | null
                )?.status === "approved",
          }
        : null,
    };
  });

  return NextResponse.json({
    ok: true,
    agents: shaped,
    total,
    limit,
    offset,
  });
}

// ---------------------------------------------------------------------------
// POST /api/agents — push
// ---------------------------------------------------------------------------

interface AgentSubmission {
  name: string;
  description: string;
  license: string;
  version: string | null;
  systemPrompt: string;

  // Queryable config
  tools: string | null;
  disallowedTools: string | null;
  model: string | null;
  permissionMode: string | null;
  maxTurns: number | null;
  memoryScope: string | null;
  background: boolean | null;
  effort: string | null;
  isolation: string | null;

  // Opaque config
  config: {
    hooks: unknown | null;
    mcpServers: unknown | null;
    skillsRefs: string[] | null;
    initialPrompt: string | null;
  } | null;

  // Oathbound metadata
  compatibility: string | null;
  originalAuthor: string | null;
  visibility: "public" | "private" | null;
}

/** Create a Supabase client from Bearer token or fall back to cookie auth. */
async function getClientFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    return createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    );
  }
  return getServerClient();
}

export async function POST(request: Request) {
  const supabase = await getClientFromRequest(request);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: AgentSubmission;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  // Look up user record for namespace
  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("id, username")
    .eq("user_id", user.id)
    .single();

  if (userError || !userRecord) {
    return NextResponse.json(
      { error: "User profile not found. Please set up your username first." },
      { status: 400 }
    );
  }

  const namespace = userRecord.username;
  const admin = getAdminClient();

  // Determine version: auto-bump patch or use explicit semver
  const { data: existingVersions } = await admin
    .from("agents")
    .select("version")
    .eq("namespace", namespace)
    .eq("name", body.name);

  let version: string;

  if (body.version != null && body.version !== "") {
    if (!isValidSemver(body.version)) {
      return NextResponse.json(
        {
          error: `Invalid version "${body.version}" — must be semver (e.g. 1.0.0)`,
        },
        { status: 400 }
      );
    }

    const conflict = existingVersions?.find(
      (v) => v.version === body.version
    );
    if (conflict) {
      return NextResponse.json(
        {
          error: `Version ${body.version} already exists for ${namespace}/${body.name}`,
        },
        { status: 409 }
      );
    }
    version = body.version;
  } else {
    if (!existingVersions || existingVersions.length === 0) {
      version = "0.1.0";
    } else {
      const sorted = existingVersions
        .map((v) => v.version)
        .sort(compareSemver);
      version = bumpPatch(sorted[sorted.length - 1]);
    }
  }

  // Reconstruct canonical .md file for validation and hashing.
  // Build a temporary frontmatter object with all fields, then serialize.
  const meta: Record<string, unknown> = {
    name: body.name,
    description: body.description,
    license: body.license,
    version,
  };
  if (body.tools) meta.tools = body.tools;
  if (body.disallowedTools) meta.disallowedTools = body.disallowedTools;
  if (body.model) meta.model = body.model;
  if (body.permissionMode) meta.permissionMode = body.permissionMode;
  if (body.maxTurns) meta.maxTurns = body.maxTurns;
  if (body.config?.skillsRefs?.length) meta.skills = body.config.skillsRefs;
  if (body.config?.mcpServers) meta.mcpServers = body.config.mcpServers;
  if (body.config?.hooks) meta.hooks = body.config.hooks;
  if (body.memoryScope) meta.memory = body.memoryScope;
  if (body.background) meta.background = body.background;
  if (body.effort) meta.effort = body.effort;
  if (body.isolation) meta.isolation = body.isolation;
  if (body.config?.initialPrompt) meta.initialPrompt = body.config.initialPrompt;
  if (body.compatibility) meta.compatibility = body.compatibility;
  if (body.originalAuthor) meta["original-author"] = body.originalAuthor;

  const canonicalFile = serializeAgentFile(meta, body.systemPrompt);

  // Validate the canonical file
  const validation = validateAgent(canonicalFile);
  if (!validation.canProceed) {
    const errors = validation.checks
      .filter((c) => !c.passed)
      .map((c) => c.message);
    return NextResponse.json(
      { error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  // Compute content hash from canonical file
  const agentContentHash = createHash("sha256")
    .update(canonicalFile)
    .digest("hex");

  // Upload to Storage
  const shortHash = agentContentHash.slice(0, 6);
  const storagePath = `${namespace}/${body.name}/v${version}-${shortHash}.md`;

  const { error: uploadError } = await supabase.storage
    .from("agents")
    .upload(storagePath, canonicalFile, {
      contentType: "text/markdown",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // On-chain attestation
  const subject = `agent:${namespace}/${body.name}@${version}`;
  let suiDigest: string | undefined;
  let suiObjectId: string | undefined;
  try {
    const attestation = await ensureChainWrite(() =>
      registerAgent(subject, agentContentHash)
    );
    suiDigest = attestation.digest;
    suiObjectId = attestation.objectId ?? undefined;
  } catch (err) {
    await supabase.storage.from("agents").remove([storagePath]);
    const message = err instanceof Error ? err.message : "Unknown Sui error";
    return NextResponse.json(
      { error: `On-chain attestation failed: ${message}` },
      { status: 500 }
    );
  }

  const license = body.license.toUpperCase();

  // Build config jsonb
  const config: { [key: string]: Json | undefined } = {};
  if (body.config?.hooks) config.hooks = body.config.hooks as Json;
  if (body.config?.mcpServers) config.mcpServers = body.config.mcpServers as Json;
  if (body.config?.skillsRefs?.length)
    config.skillsRefs = body.config.skillsRefs;
  if (body.config?.initialPrompt)
    config.initialPrompt = body.config.initialPrompt;

  // Insert agent record
  const { error: insertError } = await supabase.from("agents").insert({
    name: body.name,
    namespace,
    version,
    description: body.description,
    license,
    tools: body.tools || null,
    disallowed_tools: body.disallowedTools || null,
    model: body.model || null,
    permission_mode: body.permissionMode || null,
    max_turns: body.maxTurns || null,
    memory_scope: body.memoryScope || null,
    background: body.background ?? false,
    effort: body.effort || null,
    isolation: body.isolation || null,
    config,
    system_prompt: body.systemPrompt,
    storage_path: storagePath,
    content_hash: agentContentHash,
    compatibility: body.compatibility || null,
    original_author: body.originalAuthor || null,
    user_id: userRecord.id,
    visibility: body.visibility ?? "public",
    sui_digest: suiDigest ?? null,
    sui_object_id: suiObjectId ?? null,
  });

  if (insertError) {
    // Clean up uploaded file on failure
    await supabase.storage.from("agents").remove([storagePath]);
    return NextResponse.json(
      { error: `Failed to save agent: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    namespace,
    name: body.name,
    version,
    contentHash: agentContentHash,
    suiDigest: suiDigest ?? null,
    suiObjectId: suiObjectId ?? null,
  });
}
