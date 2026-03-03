import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";
import { createTarBuffer, hashTar } from "@/lib/tar";
import { parseFrontmatter, serializeFrontmatter } from "@/lib/skill-validator";
import { ensureChainWrite, registerSkill } from "@/lib/sui";
import type { SkillFile } from "@/lib/skill-validator";
import type { Database } from "@/lib/database.types";

type LicenseType = Database["public"]["Enums"]["license_type"];

interface SkillSubmission {
  name: string;
  description: string;
  license: string;
  compatibility: string | null;
  allowedTools: string | null;
  files: SkillFile[];
}

export async function POST(request: Request) {
  const supabase = await getServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: SkillSubmission = await request.json();

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

  const namespace = userRecord.username;

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

    body.files[skillIdx].content = serializeFrontmatter(meta, skillBody);
  }

  // Create tar and hash
  const tarBuffer = await createTarBuffer(body.files);
  const tarHash = hashTar(tarBuffer);

  // Upload to storage
  const version = 1;
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
  const subject = `skill:${namespace}/${body.name}`;

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
  const license = body.license.toUpperCase() as LicenseType;

  const { error: insertError } = await supabase.from("skills").insert({
    name: body.name,
    namespace,
    description: body.description,
    license,
    compatibility: body.compatibility || null,
    allowed_tools: body.allowedTools || null,
    storage_path: storagePath,
    tar_hash: tarHash,
    user_id: userRecord.id,
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
    suiDigest,
    suiObjectId,
  });
}
