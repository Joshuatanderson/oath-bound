import { renderOgImage } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "Skills Registry — Oathbound";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    title: "Skills Registry",
    description: "Browse verified and audited skills for Claude Code.",
  });
}
