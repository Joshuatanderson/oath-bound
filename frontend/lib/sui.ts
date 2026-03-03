import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { createHash } from "crypto";

// --- Singletons ---

const client = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl("testnet"),
  network: "testnet",
});
const keypair = Ed25519Keypair.fromSecretKey(process.env.SUI_SECRET_KEY!);
const PACKAGE_ID = process.env.SUI_PACKAGE_ID!;
const ADMIN_CAP_ID = process.env.SUI_ADMIN_CAP_ID!;

// --- Types ---

export interface AttestationResult {
  digest: string;
  objectId: string | null;
}

// --- Internal helpers ---

/** Convert hex string (from hashTar) to byte array for tx.pure.vector("u8", ...) */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

/** SHA-256 hash a string to 32 bytes (contract asserts subject.length() == 32) */
function sha256(input: string): number[] {
  const hash = createHash("sha256").update(input).digest();
  return Array.from(hash);
}

/** Sign, execute, and extract digest + created object ID */
async function executeAttestation(tx: Transaction): Promise<AttestationResult> {
  const result = await client.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true },
  });

  if (result.effects?.status.status !== "success") {
    throw new Error(
      `Transaction failed: ${result.effects?.status.error ?? "unknown error"} (digest: ${result.digest})`
    );
  }

  const created = result.effects.created;
  const objectId = created?.[0]?.reference.objectId ?? null;

  return { digest: result.digest, objectId };
}

// --- Exported attestation functions ---

export async function createSkillAttestation(
  subject: string,
  skillHash: string,
  uri: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::attestation::create_skill`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(skillHash)),
      tx.pure.string(uri),
    ],
  });
  return executeAttestation(tx);
}

export async function createAuditAttestation(
  skillObjectId: string,
  subject: string,
  skillHash: string,
  uri: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::attestation::create_audit`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(skillObjectId),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(skillHash)),
      tx.pure.string(uri),
    ],
  });
  return executeAttestation(tx);
}

export async function createAuthorAttestation(
  subject: string,
  uri: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::attestation::create_author`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.string(uri),
    ],
  });
  return executeAttestation(tx);
}

export async function createPersonaAttestation(
  authorObjectId: string,
  subject: string,
  personaHash: string,
  uri: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::attestation::create_persona`,
    arguments: [
      tx.object(ADMIN_CAP_ID),
      tx.object(authorObjectId),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(personaHash)),
      tx.pure.string(uri),
    ],
  });
  return executeAttestation(tx);
}
