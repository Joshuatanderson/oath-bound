import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerClient } from "@/lib/supabase.server";
import { getAdminClient } from "@/lib/supabase.admin";
import { createTarBuffer, hashTar } from "@/lib/tar";
import { contentHash } from "@/lib/content-hash";
import {
  parseFrontmatter,
  serializeFrontmatter,
  validateSkill,
} from "@/lib/skill-validator";
import { isValidSemver, compareSemver, bumpPatch } from "@/lib/semver";
import { ensureChainWrite, registerSkill } from "@/lib/sui";
import type { SkillFile } from "@/lib/skill-validator";
import type { Database } from "@/lib/database.types";

/** Escape ILIKE wildcards in user input to prevent wildcard injection. */
function escapeIlike(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

export async function GET(request: Request) {
  const admin = getAdminClient();
  const { searchParams } = new URL(request.url);

  const q = searchParams.get('q')?.trim() ?? '';
  const namespace = searchParams.get('namespace')?.trim() ?? '';
  const sparse = searchParams.get('sparse') === 'true';
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') ?? '50', 10) || 50, 1), 100);
  const offset = Math.max(parseInt(searchParams.get('offset') ?? '0', 10) || 0, 0);

  let query = admin
    .from('skills')
    .select(`
      id, name, description, namespace, version, license, visibility,
      users (username, display_name, identity_verifications (status)),
      audits (id, passed)
    `)
    .eq('visibility', 'public')
    .order('created_at', { ascending: false });

  if (namespace) {
    query = query.eq('namespace', namespace);
  }

  if (q) {
    const escaped = escapeIlike(q);
    query = query.or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  const { data: skills, error } = await query;

  if (error) {
    return NextResponse.json({ error: `Query failed: ${error.message}` }, { status: 500 });
  }

  // Deduplicate to latest version per namespace/name
  const seen = new Map<string, (typeof skills)[0]>();
  for (const skill of skills) {
    const key = `${skill.namespace}/${skill.name}`;
    const existing = seen.get(key);
    if (!existing || compareSemver(skill.version, existing.version) > 0) {
      seen.set(key, skill);
    }
  }
  const deduped = [...seen.values()];
  const total = deduped.length;

  // Paginate
  const page = deduped.slice(offset, offset + limit);

  // Shape response
  const shaped = page.map((skill) => {
    if (sparse) {
      return {
        name: skill.name,
        namespace: skill.namespace,
        description: skill.description,
        version: skill.version,
      };
    }

    const author = Array.isArray(skill.users) ? skill.users[0] : skill.users;
    const audits = skill.audits ?? [];
    const hasPassingAudit = audits.some((a) => a.passed);
    const hasAnyAudit = audits.length > 0;

    return {
      name: skill.name,
      namespace: skill.namespace,
      description: skill.description,
      version: skill.version,
      license: skill.license,
      visibility: skill.visibility,
      author: author ? {
        username: author.username,
        display_name: author.display_name,
        verified: Array.isArray(author.identity_verifications)
          ? author.identity_verifications.some((v: { status: string }) => v.status === 'approved')
          : (author.identity_verifications as { status: string } | null)?.status === 'approved',
      } : null,
      audit_status: hasPassingAudit ? 'passed' : hasAnyAudit ? 'failed' : 'none',
    };
  });

  return NextResponse.json({ ok: true, skills: shaped, total, limit, offset });
}

interface SkillSubmission {
  name: string;
  description: string;
  license: string;
  compatibility: string | null;
  allowedTools: string | null;
  originalAuthor: string | null;
  version: string | null;
  visibility: "public" | "private" | null;
  files: SkillFile[];
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

  let body: SkillSubmission;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Look up user record for namespace
  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("id, username")
    .eq("user_id", user.id)
    .single();

  if (userError || !userRecord) {
    return NextResponse.json(
      {
        error:
          "User profile not found. Please set up your username first.",
      },
      { status: 400 }
    );
  }

  // Enforce identity verification before allowing skill submission
  const admin = getAdminClient();
  const { data: verification } = await admin
    .from("identity_verifications")
    .select("status")
    .eq("user_id", userRecord.id)
    .single();

  if (verification?.status !== "approved") {
    return NextResponse.json(
      { error: "Identity verification required before submitting skills" },
      { status: 403 }
    );
  }

  const namespace = userRecord.username;

  // Server-side validation — client-side checks can be bypassed via direct POST
  const validation = validateSkill(body.files);
  if (!validation.canProceed) {
    const errors = validation.checks
      .filter((c) => !c.passed)
      .map((c) => c.message);
    return NextResponse.json(
      { error: "Validation failed", details: errors },
      { status: 400 }
    );
  }

  // Determine version: auto-bump patch or use explicit semver
  const { data: existingVersions } = await admin
    .from("skills")
    .select("version")
    .eq("namespace", namespace)
    .eq("name", body.name);

  let version: string;

  if (body.version != null && body.version !== "") {
    if (!isValidSemver(body.version)) {
      return NextResponse.json(
        { error: `Invalid version "${body.version}" — must be semver (e.g. 1.0.0)` },
        { status: 400 }
      );
    }

    const conflict = existingVersions?.find((v) => v.version === body.version);
    if (conflict) {
      return NextResponse.json(
        { error: `Version ${body.version} already exists for ${namespace}/${body.name}` },
        { status: 409 }
      );
    }
    version = body.version;
  } else {
    // Auto: find highest existing version, bump patch
    if (!existingVersions || existingVersions.length === 0) {
      version = "0.1.0";
    } else {
      const sorted = existingVersions
        .map((v) => v.version)
        .sort(compareSemver);
      version = bumpPatch(sorted[sorted.length - 1]);
    }
  }

  // Rewrite SKILL.md front matter with canonical form values
  const rootDir = body.files[0].path.split("/")[0];
  const skillIdx = body.files.findIndex(
    (f) => f.path === `${rootDir}/SKILL.md`
  );
  if (skillIdx !== -1) {
    const { meta, body: skillBody } = parseFrontmatter(
      body.files[skillIdx].content
    );

    meta["name"] = body.name;
    meta["description"] = body.description;
    meta["license"] = body.license;
    meta["version"] = version;

    if (body.compatibility) {
      meta["compatibility"] = body.compatibility;
    } else {
      delete meta["compatibility"];
    }

    if (body.allowedTools) {
      meta["allowed-tools"] = body.allowedTools;
    } else {
      delete meta["allowed-tools"];
    }

    if (body.originalAuthor) {
      if (!meta["metadata"]) meta["metadata"] = {};
      const metaObj = meta["metadata"] as Record<string, unknown>;
      if (!metaObj["oathbound"]) metaObj["oathbound"] = {};
      const ob = metaObj["oathbound"] as Record<string, unknown>;
      ob["original-author"] = body.originalAuthor;
    } else {
      // Clean up if empty
      const metaObj = meta["metadata"] as Record<string, unknown> | undefined;
      if (metaObj?.["oathbound"]) {
        delete (metaObj["oathbound"] as Record<string, unknown>)["original-author"];
      }
    }

    body.files[skillIdx].content = serializeFrontmatter(meta, skillBody);
  }

  // Normalize tar root directory to match the validated skill name.
  // The uploader may have used a different directory name in their files.
  if (rootDir !== body.name) {
    for (const f of body.files) {
      f.path = body.name + f.path.slice(rootDir.length);
    }
  }

  // Create tar and hash
  const tarBuffer = await createTarBuffer(body.files);
  const tarHash = hashTar(tarBuffer);

  // Strip root dir prefix so paths match what's on disk after extraction
  // Upload files: "my-skill/SKILL.md" → CLI on disk: "SKILL.md"
  // After normalization, root dir is always body.name
  const hashFiles = body.files.map((f) => ({
    path: f.path.slice(body.name.length + 1),
    content: f.content,
  }));
  const contentHashValue = contentHash(hashFiles);
  const shortHash = tarHash.slice(0, 6);
  const storagePath = `${namespace}/${body.name}/v${version}-${shortHash}.tar`;
  const { error: uploadError } = await supabase.storage
    .from("skills")
    .upload(storagePath, tarBuffer, {
      contentType: "application/x-tar",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  // On-chain attestation
  const subject = `skill:${namespace}/${body.name}@${version}`;

  let suiDigest: string | undefined;
  let suiObjectId: string | undefined;

  try {
    const attestation = await ensureChainWrite(() =>
      registerSkill(subject, tarHash)
    );
    suiDigest = attestation.digest;
    suiObjectId = attestation.objectId ?? undefined;
  } catch (err) {
    // Clean up uploaded file on Sui failure
    await supabase.storage.from("skills").remove([storagePath]);
    const message = err instanceof Error ? err.message : "Unknown Sui error";
    return NextResponse.json(
      { error: `On-chain attestation failed: ${message}` },
      { status: 500 }
    );
  }

  // Insert skill record
  const license = body.license.toUpperCase();

  const { error: insertError } = await supabase.from("skills").insert({
    name: body.name,
    namespace,
    version,
    description: body.description,
    license,
    compatibility: body.compatibility || null,
    allowed_tools: body.allowedTools || null,
    original_author: body.originalAuthor || null,
    storage_path: storagePath,
    tar_hash: tarHash,
    content_hash: contentHashValue,
    user_id: userRecord.id,
    visibility: body.visibility ?? "public",
    sui_digest: suiDigest,
    sui_object_id: suiObjectId,
  });

  if (insertError) {
    // Clean up uploaded file on failure
    await supabase.storage.from("skills").remove([storagePath]);
    return NextResponse.json(
      { error: `Failed to save skill: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    namespace,
    name: body.name,
    version,
    suiDigest,
    suiObjectId,
  });
}
