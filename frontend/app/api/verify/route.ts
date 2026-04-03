import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServerClient } from "@/lib/supabase.server";
import { getAdminClient } from "@/lib/supabase.admin";
import { ensureChainWrite, registerPersona } from "@/lib/sui";

const PERSONA_API_BASE = "https://withpersona.com/api/v1";

/** SHA-256 hash of identity fields: name + DOB + ID number. */
function hashIdentity(attrs: {
  nameFirst?: string | null;
  nameLast?: string | null;
  birthdate?: string | null;
  identificationNumber?: string | null;
}): string {
  const parts = [
    attrs.nameFirst ?? "",
    attrs.nameLast ?? "",
    attrs.birthdate ?? "",
    attrs.identificationNumber ?? "",
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
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

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const inquiryId = body.inquiryId;

  if (!inquiryId || typeof inquiryId !== "string") {
    return NextResponse.json(
      { error: "Missing inquiryId" },
      { status: 400 }
    );
  }

  // Confirm inquiry status with Persona API
  const apiKey = process.env.PERSONA_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Persona API key not configured" },
      { status: 500 }
    );
  }

  const personaRes = await fetch(
    `${PERSONA_API_BASE}/inquiries/${inquiryId}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Persona-Version": "2023-01-05",
        "Key-Inflection": "camel",
      },
    }
  );

  if (!personaRes.ok) {
    const text = await personaRes.text();
    console.error("Persona API error:", personaRes.status, text);
    return NextResponse.json(
      { error: "Failed to verify with Persona" },
      { status: 502 }
    );
  }

  const personaData = await personaRes.json();

  const inquiry = personaData.data?.attributes;

  if (!inquiry) {
    return NextResponse.json(
      { error: "Invalid Persona response" },
      { status: 502 }
    );
  }

  // Validate reference-id matches the authenticated user
  if (inquiry.referenceId !== user.id) {
    return NextResponse.json(
      { error: "Inquiry does not belong to this user" },
      { status: 403 }
    );
  }

  // Map Persona status to our status
  const statusMap: Record<string, string> = {
    completed: "approved",
    approved: "approved",
    declined: "declined",
    expired: "expired",
    failed: "declined",
  };
  const status = statusMap[inquiry.status] ?? "pending";

  // Hash identity fields from top-level attributes (name + DOB + ID number)
  const personaHash = hashIdentity({
    nameFirst: inquiry.nameFirst,
    nameLast: inquiry.nameLast,
    birthdate: inquiry.birthdate,
    identificationNumber: inquiry.identificationNumber,
  });

  console.log("[Persona] Inquiry status:", inquiry.status, "→ mapped:", status);
  console.log("[Persona] Identity hash:", personaHash);

  // Resolve public user ID (identity_verifications references public.users.id)
  const admin = getAdminClient();
  const { data: publicUser } = await supabase
    .from("users")
    .select("id")
    .eq("user_id", user.id)
    .single();

  if (!publicUser) {
    return NextResponse.json(
      { error: "Please set up your username before verifying" },
      { status: 400 }
    );
  }

  // Write on-chain attestation if approved
  let suiDigest: string | null = null;
  let suiObjectId: string | null = null;

  if (status === "approved" && personaHash) {
    try {
      const chainResult = await ensureChainWrite(() =>
        registerPersona(publicUser.id, personaHash)
      );
      suiDigest = chainResult.digest;
      suiObjectId = chainResult.objectId;
      console.log("[Persona] On-chain attestation:", suiDigest, suiObjectId);
    } catch (err) {
      // Log but don't block — verification still succeeded
      console.error("[Persona] Chain write failed:", err);
    }
  }

  // Upsert into identity_verifications
  const { error: dbError } = await admin
    .from("identity_verifications")
    .upsert(
      {
        user_id: publicUser.id,
        persona_inquiry_id: inquiryId,
        persona_hash: personaHash,
        status,
        completed_at: status !== "pending" ? new Date().toISOString() : null,
        sui_digest: suiDigest,
        sui_object_id: suiObjectId,
      },
      { onConflict: "user_id" }
    );

  if (dbError) {
    console.error("DB upsert error:", dbError);
    return NextResponse.json(
      { error: "Failed to save verification status" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status });
}
