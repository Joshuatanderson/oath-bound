import { renderOgImage } from "@/lib/og";

export const runtime = "nodejs";
export const alt = "Oathbound — Verified developers. Audited skills. Cryptographic proof.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return renderOgImage({
    title: "Oathbound",
    description: "Verified developers. Audited skills. Cryptographic proof.",
  });
}
