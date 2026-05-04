"use client";

import { memo, useState } from "react";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  label: string;
  value: string | number;
  hint?: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}

function KpiCardImpl({ label, value, hint, tone, active = false, onClick }: Props) {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? tint(tone, 22)
    : hovered
    ? tint(tone, 16)
    : tint(tone, 8);
  const border = active || hovered ? tone : tint(tone, 35);

  const content = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[22px] font-black tracking-[-0.02em]" style={{ color: tone }}>
          {label}
        </div>
        <div className="text-[32px] font-black leading-none" style={{ color: tone }}>
          {value}
        </div>
      </div>
      {hint && (
        <div className="mt-2 text-[12px] font-semibold" style={{ color: tone, opacity: 0.7 }}>
          {hint}
        </div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="rounded-[16px] border px-5 py-5 text-left transition-colors hover:brightness-110"
        style={{ background: bg, borderColor: border }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="rounded-[16px] border px-5 py-5"
      style={{ background: bg, borderColor: border }}
    >
      {content}
    </div>
  );
}

export const KpiCard = memo(KpiCardImpl);
