import { renderOgImage } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "Agents Registry — Oathbound";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    title: "Agents Registry",
    description: "Browse verified agent configurations for Claude Code.",
  });
}
