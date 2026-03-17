import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { getServerClient } from "@/lib/supabase.server";
import { getAdminClient } from "@/lib/supabase.admin";
import { ensureChainWrite, registerFounder } from "@/lib/sui";

export async function POST(request: Request) {
  // Gate: if env var absent, this route doesn't exist
  const expectedPassword = process.env.FOUNDER_BYPASS_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await getServerClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Require username (also gives us public user ID)
  const { data: publicUser } = await supabase
    .from("users")
    .select("id, username")
    .eq("user_id", user.id)
    .single();

  if (!publicUser?.username) {
    return NextResponse.json(
      { error: "Please set up your username before verifying" },
      { status: 400 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const password = body.password;
  if (!password || typeof password !== "string") {
    return NextResponse.json({ error: "Missing password" }, { status: 400 });
  }

  // Constant-time comparison
  const a = Buffer.from(password);
  const b = Buffer.from(expectedPassword);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Invalid password" }, { status: 403 });
  }

  // Sentinel values — no DB schema changes needed
  const personaInquiryId = `founder-bypass:${publicUser.id}`;
  const personaHash = createHash("sha256")
    .update(`founder-bypass:${publicUser.id}`)
    .digest("hex");

  // Write on-chain attestation with claim = "founder_verified"
  let suiDigest: string | null = null;
  let suiObjectId: string | null = null;

  try {
    const chainResult = await ensureChainWrite(() =>
      registerFounder(publicUser.id, personaHash)
    );
    suiDigest = chainResult.digest;
    suiObjectId = chainResult.objectId;
    console.log("[Founder bypass] On-chain attestation:", suiDigest, suiObjectId);
  } catch (err) {
    // Log but don't block — bypass still succeeded
    console.error("[Founder bypass] Chain write failed:", err);
  }

  // Upsert into identity_verifications
  const admin = getAdminClient();
  const { error: dbError } = await admin
    .from("identity_verifications")
    .upsert(
      {
        user_id: publicUser.id,
        persona_inquiry_id: personaInquiryId,
        persona_hash: personaHash,
        status: "approved",
        completed_at: new Date().toISOString(),
        sui_digest: suiDigest,
        sui_object_id: suiObjectId,
      },
      { onConflict: "user_id" }
    );

  if (dbError) {
    console.error("[Founder bypass] DB upsert error:", dbError);
    return NextResponse.json(
      { error: "Failed to save verification status" },
      { status: 500 }
    );
  }

  return NextResponse.json({ status: "approved" });
}
