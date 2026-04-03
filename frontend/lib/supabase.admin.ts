import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { Database } from "./database.types";

/**
 * Service-role Supabase client — bypasses RLS.
 * Use only in server-side API routes for operations that need elevated privileges.
 */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient<Database>(url, key);
}

/**
 * Returns a 403 NextResponse if the user hasn't completed identity verification.
 * Returns null if verification is approved (caller should proceed).
 */
export async function identityVerifiedGate(userId: string): Promise<NextResponse | null> {
  const admin = getAdminClient();
  const { data: verification } = await admin
    .from("identity_verifications")
    .select("status")
    .eq("user_id", userId)
    .single();

  if (verification?.status !== "approved") {
    return NextResponse.json(
      { error: "Identity verification required" },
      { status: 403 }
    );
  }
  return null;
}
