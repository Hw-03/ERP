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
  compact?: boolean;
}

function KpiCardImpl({ label, value, hint, tone, active = false, onClick, compact = false }: Props) {
  const [hovered, setHovered] = useState(false);

  const bg = active
    ? tint(tone, 22)
    : hovered
    ? tint(tone, 16)
    : tint(tone, 8);
  const border = active || hovered ? tone : tint(tone, 35);

  const boxCls = compact
    ? "rounded-[12px] border px-4 py-2.5"
    : "rounded-[16px] border px-3 py-3 lg:px-5 lg:py-5";

  const content = compact ? (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div
          className="truncate text-[22px] font-black leading-tight tracking-[-0.02em]"
          style={{ color: tone }}
        >
          {label}
        </div>
        {hint && (
          <div
            className="truncate text-[12px] font-semibold leading-tight"
            style={{ color: tone, opacity: 0.7 }}
          >
            {hint}
          </div>
        )}
      </div>
      <div
        className="-mt-1 shrink-0 text-[32px] font-black leading-none"
        style={{ color: tone }}
      >
        {value}
      </div>
    </div>
  ) : (
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
        aria-pressed={active}
        className={`${boxCls} text-left transition-colors hover:brightness-110`}
        style={{ background: bg, borderColor: border }}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={boxCls}
      style={{ background: "transparent", borderColor: border }}
    >
      {content}
    </div>
  );
}

export const KpiCard = memo(KpiCardImpl);
