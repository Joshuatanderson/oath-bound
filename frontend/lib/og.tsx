import { ImageResponse } from "next/og";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type OgImageProps = {
  title: string;
  description?: string;
  namespace?: string;
  category?: "SKILL" | "AGENT";
};

const fontRegular = readFileSync(
  join(process.cwd(), "public/fonts/NotoSans-Regular.ttf")
);
const fontSemiBold = readFileSync(
  join(process.cwd(), "public/fonts/NotoSans-SemiBold.ttf")
);

const logoPng = readFileSync(
  join(process.cwd(), "public/fonts/oathbound-logo.png")
);
const logoBase64 = `data:image/png;base64,${logoPng.toString("base64")}`;

export function renderOgImage({
  title,
  description,
  namespace,
  category,
}: OgImageProps) {
  const truncatedDesc = description
    ? description.length > 120
      ? description.slice(0, 117) + "..."
      : description
    : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: "#020809",
          padding: "60px",
          border: "2px solid #105658",
          fontFamily: "NotoSans",
        }}
      >
        {/* Top: Logo + brand + category pill */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <img src={logoBase64} width={48} height={46} />
          <span
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#3fa8a4",
              letterSpacing: "-0.02em",
            }}
          >
            Oathbound
          </span>
          {category && (
            <span
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "#020809",
                backgroundColor: "#3fa8a4",
                padding: "4px 12px",
                borderRadius: "9999px",
                marginLeft: "8px",
                letterSpacing: "0.05em",
              }}
            >
              {category}
            </span>
          )}
        </div>

        {/* Middle: Title + Description */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            flex: 1,
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 52,
              fontWeight: 600,
              color: "#ffffff",
              lineHeight: 1.15,
              letterSpacing: "-0.02em",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </span>
          {truncatedDesc && (
            <span
              style={{
                fontSize: 22,
                color: "#7fd1c8",
                lineHeight: 1.4,
              }}
            >
              {truncatedDesc}
            </span>
          )}
        </div>

        {/* Accent line */}
        <div
          style={{
            width: "100%",
            height: "2px",
            backgroundColor: "#3fa8a4",
            marginBottom: "16px",
          }}
        />

        {/* Bottom: namespace + domain */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 16, color: "#6b7280" }}>
            {namespace ?? ""}
          </span>
          <span style={{ fontSize: 16, color: "#3fa8a4" }}>oathbound.ai</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "NotoSans", data: fontRegular, weight: 400, style: "normal" },
        { name: "NotoSans", data: fontSemiBold, weight: 600, style: "normal" },
      ],
    }
  );
}
