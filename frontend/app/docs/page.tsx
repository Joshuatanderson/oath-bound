import { readFileSync } from "node:fs";
import { join } from "node:path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export const metadata = {
  title: "Docs | Oathbound",
  description:
    "Documentation for Oathbound — the trust and verification layer for Claude Code skills.",
};

export default function DocsPage() {
  const md = readFileSync(
    join(process.cwd(), "public", "docs.md"),
    "utf-8",
  );

  return (
    <main className="mx-auto max-w-3xl px-6 py-24">
      <article className="prose-docs">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
      </article>
    </main>
  );
}
