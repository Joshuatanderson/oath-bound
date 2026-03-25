import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
} from "@mysten/sui/jsonRpc";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { createHash } from "crypto";

// --- Lazy singletons (avoid crashing at build time when env vars are absent) ---

let _client: SuiJsonRpcClient | null = null;
let _keypair: Ed25519Keypair | null = null;

function getClient(): SuiJsonRpcClient {
  if (!_client) {
    _client = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl("testnet"),
      network: "testnet",
    });
  }
  return _client;
}

function getKeypair(): Ed25519Keypair {
  if (!_keypair) {
    const key = process.env.SUI_SECRET_KEY;
    if (!key) throw new Error("SUI_SECRET_KEY is not set");
    _keypair = Ed25519Keypair.fromSecretKey(key);
  }
  return _keypair;
}

function getPackageId(): string {
  const id = process.env.SUI_PACKAGE_ID;
  if (!id) throw new Error("SUI_PACKAGE_ID is not set");
  return id;
}

function getAdminCapId(): string {
  const id = process.env.SUI_ADMIN_CAP_ID;
  if (!id) throw new Error("SUI_ADMIN_CAP_ID is not set");
  return id;
}

// --- Types ---

export interface AttestationResult {
  digest: string;
  objectId: string | null;
}

// --- Internal helpers ---

/** Convert hex string to byte array for tx.pure.vector("u8", ...) */
function hexToBytes(hex: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(parseInt(hex.substring(i, i + 2), 16));
  }
  return bytes;
}

/** SHA-256 hash a string to 32 bytes */
export function sha256(input: string): number[] {
  const hash = createHash("sha256").update(input).digest();
  return Array.from(hash);
}

/** Sign, execute, and extract digest + created object ID */
async function executeAttestation(tx: Transaction): Promise<AttestationResult> {
  const result = await getClient().signAndExecuteTransaction({
    transaction: tx,
    signer: getKeypair(),
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

// --- Chain write wrapper ---

/** Await a chain write and confirm finality before returning. */
export async function ensureChainWrite(
  chainFn: () => Promise<AttestationResult>
): Promise<AttestationResult> {
  const result = await chainFn();
  await getClient().waitForTransaction({ digest: result.digest });
  return result;
}

// --- Exported attestation functions ---

export async function registerSkill(
  subject: string,
  skillHash: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_skill`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(skillHash)),
      tx.pure.string(""),
    ],
  });
  return executeAttestation(tx);
}

export async function registerAudit(
  subject: string,
  skillHash: string,
  reportHash: string,
  uri: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_audit`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(skillHash)),
      tx.pure.vector("u8", hexToBytes(reportHash)),
      tx.pure.string(uri),
    ],
  });
  return executeAttestation(tx);
}

export async function registerAuthor(
  subject: string,
  uri: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_author`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.string(uri),
    ],
  });
  return executeAttestation(tx);
}

export async function registerPersona(
  subject: string,
  personaHash: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_persona`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(personaHash)),
    ],
  });
  return executeAttestation(tx);
}

export async function registerFounder(
  subject: string,
  bypassHash: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_founder`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(bypassHash)),
    ],
  });
  return executeAttestation(tx);
}

export async function registerAgent(
  subject: string,
  agentHash: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_agent`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", hexToBytes(agentHash)),
      tx.pure.string(""),
    ],
  });
  return executeAttestation(tx);
}

export async function registerAuthorship(
  subject: string,
  authorSubject: string
): Promise<AttestationResult> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${getPackageId()}::registrations::register_authorship`,
    arguments: [
      tx.object(getAdminCapId()),
      tx.pure.vector("u8", sha256(subject)),
      tx.pure.vector("u8", sha256(authorSubject)),
    ],
  });
  return executeAttestation(tx);
}
