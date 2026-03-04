"use client";

import { useEffect, useRef, useCallback } from "react";

// --- Pure math helpers ---

function hash(r: number, c: number) {
  let h = (r * 7919 + c * 104729 + 13) | 0;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return (h & 0xffff) / 0xffff;
}

function traceScale(
  ctx: CanvasRenderingContext2D,
  cx: number, cy: number, H: number, W: number
) {
  const hw = W / 2, hh = H / 2;
  const bulge = hw * 1.06;
  ctx.beginPath();
  ctx.moveTo(cx - hw, cy - hh);
  ctx.lineTo(cx + hw, cy - hh);
  ctx.bezierCurveTo(cx + hw, cy - hh * 0.3, cx + bulge, cy + hh * 0.15, cx + bulge * 0.85, cy + hh * 0.55);
  ctx.bezierCurveTo(cx + hw * 0.6, cy + hh * 0.95, cx + hw * 0.15, cy + hh, cx, cy + hh);
  ctx.bezierCurveTo(cx - hw * 0.15, cy + hh, cx - hw * 0.6, cy + hh * 0.95, cx - bulge * 0.85, cy + hh * 0.55);
  ctx.bezierCurveTo(cx - bulge, cy + hh * 0.15, cx - hw, cy - hh * 0.3, cx - hw, cy - hh);
  ctx.closePath();
}

type RGB = [number, number, number];

function lerp3(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function waveRGB(
  x: number, y: number, t: number,
  s: number, sp: number,
  colA: RGB, colB: RGB, colC: RGB,
  br: number
): RGB {
  const v1 = Math.sin(x * s + t * sp * 0.7) * Math.cos(y * s * 0.8 + t * sp * 0.5);
  const v2 = Math.sin((x + y) * s * 0.6 + t * sp * 1.1) * 0.7;
  const v3 = Math.cos(y * s * 1.2 - t * sp * 0.4 + x * s * 0.3) * 0.5;
  const blend = (v1 + v2 + v3 + 1.5) / 3;
  const rgb = blend < 0.5
    ? lerp3(colA, colB, blend * 2)
    : lerp3(colB, colC, (blend - 0.5) * 2);
  return [rgb[0] * br | 0, rgb[1] * br | 0, rgb[2] * br | 0];
}

// --- Locked settings ---

const P = {
  scaleH: 40,
  hwRatio: 0.58,
  vOverlap: 0.42,
  sizeVar: 0.05,
  edgeW: 0.1,
  glowW: 2,
  edgeAlpha: 0.54,
  midrib: 0.6,
  waveSpeed: 0.5,
  waveScale: 0.004,
  colA: [17, 43, 44] as RGB,
  colB: [255, 255, 255] as RGB,
  colC: [16, 86, 88] as RGB,
  brightness: 0.45,
};

const BG = "#030b0c";

// --- Component ---

export default function ScaleHero() {
  const cvR = useRef<HTMLCanvasElement>(null);
  const afR = useRef<number>(0);
  const tRef = useRef(0);

  const anim = useCallback(() => {
    const cv = cvR.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rc = cv.getBoundingClientRect();
    if (cv.width !== rc.width * dpr || cv.height !== rc.height * dpr) {
      cv.width = rc.width * dpr;
      cv.height = rc.height * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const p = P;
    const w = rc.width, h = rc.height;
    tRef.current += 0.016;
    const t = tRef.current;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    const H = p.scaleH;
    const W = H * p.hwRatio;
    const rowStep = H * (1 - p.vOverlap);
    const colStep = W * 0.97;

    const nCols = Math.ceil(w / colStep) + 4;
    const minRow = -3;
    const maxRow = Math.ceil(h / rowStep) + 3;

    for (let row = maxRow; row >= minRow; row--) {
      const odd = ((row % 2) + 2) % 2 === 1;
      for (let col = -2; col < nCols; col++) {
        const sv = hash(row, col);
        const localH = H * (1 + (sv - 0.5) * 2 * p.sizeVar);
        const localW = localH * p.hwRatio;
        const cx = col * colStep + (odd ? colStep * 0.5 : 0);
        const cy = row * rowStep;

        const [r, g, b] = waveRGB(
          cx, cy, t, p.waveScale, p.waveSpeed,
          p.colA, p.colB, p.colC, p.brightness
        );

        const hh = localH / 2;
        const edgeGrad = ctx.createLinearGradient(cx, cy - hh, cx, cy + hh);
        const ea = p.edgeAlpha;
        edgeGrad.addColorStop(0, `rgba(${r},${g},${b},${ea * 0.15})`);
        edgeGrad.addColorStop(0.4, `rgba(${r},${g},${b},${ea * 0.5})`);
        edgeGrad.addColorStop(1, `rgba(${r},${g},${b},${ea})`);

        if (p.glowW > 0) {
          traceScale(ctx, cx, cy, localH, localW);
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = edgeGrad;
          ctx.lineWidth = p.edgeW + p.glowW;
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        traceScale(ctx, cx, cy, localH, localW);
        ctx.strokeStyle = edgeGrad;
        ctx.lineWidth = p.edgeW;
        ctx.stroke();

        traceScale(ctx, cx, cy, localH, localW);
        ctx.fillStyle = BG;
        ctx.fill();

        if (p.midrib > 0) {
          const ribTop = cy - hh * 0.85;
          const ribBot = cy + hh * 0.92;
          const grad = ctx.createLinearGradient(cx, ribTop, cx, ribBot);
          grad.addColorStop(0, `rgba(${r},${g},${b},${p.midrib * 0.1})`);
          grad.addColorStop(0.5, `rgba(${r},${g},${b},${p.midrib * 0.4})`);
          grad.addColorStop(1, `rgba(${r},${g},${b},${p.midrib * 0.7})`);
          ctx.beginPath();
          ctx.moveTo(cx, ribTop);
          ctx.lineTo(cx, ribBot);
          ctx.strokeStyle = grad;
          ctx.lineWidth = p.edgeW * 0.6;
          ctx.stroke();
        }
      }
    }

    afR.current = requestAnimationFrame(anim);
  }, []);

  useEffect(() => {
    afR.current = requestAnimationFrame(anim);
    return () => cancelAnimationFrame(afR.current);
  }, [anim]);

  return (
    <div className="fixed inset-0 z-0" style={{ background: BG }}>
      <canvas ref={cvR} className="h-full w-full" />
    </div>
  );
}
