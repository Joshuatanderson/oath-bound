import * as tar from "tar-stream";
import { createHash } from "crypto";

export interface TarEntry {
  path: string;
  content: string;
}

export async function createTarBuffer(entries: TarEntry[]): Promise<Buffer> {
  const pack = tar.pack();

  for (const entry of entries) {
    pack.entry({ name: entry.path }, entry.content);
  }

  pack.finalize();

  const chunks: Buffer[] = [];
  for await (const chunk of pack) {
    chunks.push(chunk as Buffer);
  }

  return Buffer.concat(chunks);
}

export function hashTar(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
