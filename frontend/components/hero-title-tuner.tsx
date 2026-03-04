"use client";

import { useState } from "react";

const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;
const WEIGHT_LABELS: Record<number, string> = {
  100: "Thin",
  200: "ExtraLight",
  300: "Light",
  400: "Regular",
  500: "Medium",
  600: "SemiBold",
  700: "Bold",
  800: "ExtraBold",
  900: "Black",
};

export default function HeroTitleTuner() {
  const [weight, setWeight] = useState(700);
  const [size, setSize] = useState(48);
  const [tracking, setTracking] = useState(-0.02);

  const css = `font-weight: ${weight}; font-size: ${size}px; letter-spacing: ${tracking}em;`;

  return (
    <>
      <h1
        style={{
          fontWeight: weight,
          fontSize: size,
          letterSpacing: `${tracking}em`,
        }}
        className="text-teal-0"
      >
        Oathbound
      </h1>

      {/* Floating tuner panel */}
      <div
        className="fixed left-4 top-20 z-50 w-64 rounded-lg border border-white/10 p-4"
        style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)" }}
      >
        {/* Weight selector */}
        <div className="mb-3">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-teal-3">
            <span>Weight</span>
            <span className="text-teal-1">{weight} — {WEIGHT_LABELS[weight]}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {WEIGHTS.map((w) => (
              <button
                key={w}
                onClick={() => setWeight(w)}
                className="rounded px-2 py-0.5 font-mono text-[10px] transition-colors"
                style={{
                  background: w === weight ? "rgba(63,168,164,0.3)" : "rgba(255,255,255,0.05)",
                  color: w === weight ? "#7fd1c8" : "#5aaba6",
                  border: w === weight ? "1px solid rgba(63,168,164,0.5)" : "1px solid transparent",
                }}
              >
                {w}
              </button>
            ))}
          </div>
        </div>

        {/* Size slider */}
        <div className="mb-3">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-teal-3">
            <span>Size</span>
            <span className="text-teal-1">{size}px</span>
          </div>
          <input
            type="range" min={32} max={96} step={1} value={size}
            onChange={(e) => setSize(parseInt(e.target.value))}
            style={{ width: "100%", accentColor: "#3fa8a4", height: 3, cursor: "pointer" }}
          />
        </div>

        {/* Tracking slider */}
        <div className="mb-3">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-teal-3">
            <span>Tracking</span>
            <span className="text-teal-1">{tracking.toFixed(3)}em</span>
          </div>
          <input
            type="range" min={-0.08} max={0.08} step={0.002} value={tracking}
            onChange={(e) => setTracking(parseFloat(e.target.value))}
            style={{ width: "100%", accentColor: "#3fa8a4", height: 3, cursor: "pointer" }}
          />
        </div>

        {/* Copy CSS */}
        <button
          onClick={() => navigator.clipboard.writeText(css)}
          className="w-full rounded py-1 font-mono text-[10px] transition-colors"
          style={{
            background: "rgba(63,168,164,0.12)",
            border: "1px solid rgba(63,168,164,0.25)",
            color: "#7fd1c8",
            cursor: "pointer",
          }}
        >
          copy css
        </button>
        <div className="mt-1 text-center font-mono text-[9px] text-zinc-500">{css}</div>
      </div>
    </>
  );
}
