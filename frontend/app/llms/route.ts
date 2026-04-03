import { readFileSync } from "node:fs";
import { join } from "node:path";

export function GET() {
  const md = readFileSync(
    join(process.cwd(), "public", "docs.md"),
    "utf-8",
  );
  return new Response(md, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
