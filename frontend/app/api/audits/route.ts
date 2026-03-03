import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase.server";

const MAX_PDF_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: Request) {
  const supabase = await getServerClient();

  // Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Role check
  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .select("id, role")
    .eq("user_id", user.id)
    .single();

  if (userError || !userRecord) {
    return NextResponse.json(
      { error: "User profile not found. Please set up your username first." },
      { status: 400 }
    );
  }

  if (userRecord.role !== "AUDITOR") {
    return NextResponse.json(
      { error: "Only auditors can submit audits." },
      { status: 403 }
    );
  }

  // Parse FormData
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid form data" },
      { status: 400 }
    );
  }

  const skillId = formData.get("skill_id") as string | null;
  const passedRaw = formData.get("passed") as string | null;
  const file = formData.get("file") as File | null;

  if (!skillId || passedRaw === null || !file) {
    return NextResponse.json(
      { error: "skill_id, passed, and file are required" },
      { status: 400 }
    );
  }

  const passed = passedRaw === "true";

  // Validate PDF
  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  if (file.size > MAX_PDF_SIZE) {
    return NextResponse.json(
      { error: "File must be under 10 MB" },
      { status: 400 }
    );
  }

  // Validate skill exists
  const { data: skill, error: skillError } = await supabase
    .from("skills")
    .select("id")
    .eq("id", skillId)
    .single();

  if (skillError || !skill) {
    return NextResponse.json(
      { error: "Skill not found" },
      { status: 404 }
    );
  }

  // SHA-256 hash the PDF
  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", fileBuffer);
  const reportHash = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Upload to Pinata
  const pinataJwt = process.env.PINATA_JWT;
  if (!pinataJwt) {
    return NextResponse.json(
      { error: "IPFS upload not configured" },
      { status: 500 }
    );
  }

  const pinataForm = new FormData();
  pinataForm.append("file", file);
  pinataForm.append(
    "pinataMetadata",
    JSON.stringify({ name: `audit-${skillId}-${reportHash.slice(0, 8)}.pdf` })
  );

  const pinataRes = await fetch(
    "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${pinataJwt}` },
      body: pinataForm,
    }
  );

  if (!pinataRes.ok) {
    const pinataError = await pinataRes.text();
    return NextResponse.json(
      { error: `IPFS upload failed: ${pinataError}` },
      { status: 502 }
    );
  }

  const { IpfsHash: ipfsCid } = (await pinataRes.json()) as {
    IpfsHash: string;
  };

  // Insert into DB
  const { error: insertError } = await supabase.from("audits").insert({
    skill_id: skillId,
    report_hash: reportHash,
    ipfs_cid: ipfsCid,
    passed,
    uploader: user.id,
  });

  if (insertError) {
    // Rollback: unpin from Pinata
    await fetch(`https://api.pinata.cloud/pinning/unpin/${ipfsCid}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${pinataJwt}` },
    }).catch(() => {});

    if (insertError.message.includes("Auditor cannot be the skill author")) {
      return NextResponse.json(
        { error: "You cannot audit your own skill." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: `Failed to save audit: ${insertError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ipfs_cid: ipfsCid });
}
