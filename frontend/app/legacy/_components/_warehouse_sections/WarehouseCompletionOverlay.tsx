"use client";

import { LEGACY_COLORS } from "../legacyUi";

type Flyout = { nonce: number; kind: "in" | "out"; count: number };

type Props = {
  flyout: Flyout | null;
  phase: "show" | "out";
};

export function WarehouseCompletionOverlay({ flyout, phase }: Props) {
  if (!flyout) return null;
  const isIn = flyout.kind === "in";
  const tone = isIn ? LEGACY_COLORS.green : LEGACY_COLORS.yellow;
  const heading = "요청 제출 완료";
  return (
    <div
      key={flyout.nonce}
      className="pointer-events-none fixed left-1/2 top-1/2 z-[400]"
      style={{
        transition: "opacity 380ms ease-out, transform 380ms ease-out",
        willChange: "transform, opacity",
        transform:
          phase === "out"
            ? "translate(-50%, -50%) scale(0.94)"
            : "translate(-50%, -50%) scale(1)",
        opacity: phase === "out" ? 0 : 1,
      }}
    >
      <div
        className="rounded-[36px] border-2 px-16 py-12 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)]"
        style={{
          background: `linear-gradient(135deg, ${tone}, color-mix(in srgb, ${tone} 68%, #000 32%))`,
          borderColor: `color-mix(in srgb, ${tone} 55%, #fff 45%)`,
          color: "#ffffff",
          minWidth: 380,
        }}
      >
        <div className="text-center text-[48px] font-black leading-none tracking-[-0.02em]">
          {heading}
        </div>
        <div className="mt-4 text-center text-xl font-bold opacity-90">
          {flyout.count}건
        </div>
      </div>
    </div>
  );
}
