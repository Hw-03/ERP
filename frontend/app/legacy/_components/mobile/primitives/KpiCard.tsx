"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

// 모바일 전용 primitive. 데스크탑 대응물은 common/KpiCard.tsx — 의도적 플랫폼 분리이므로 통합하지 않는다.
// (현재 화면 소비처는 없으나 모바일 디자인 시스템 카탈로그의 예약 primitive: 모바일 KPI 도입 시 사용.)
export function KpiCard({
  label,
  value,
  color,
  active = false,
  onClick,
  className,
}: {
  label: string;
  value: number | string;
  color: string;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex flex-1 flex-col items-start gap-1 rounded-[20px] border px-4 py-3 text-left transition-[transform,border-color] active:scale-[0.98]",
        className,
      )}
      style={{
        background: active ? `${color}1a` : LEGACY_COLORS.s2,
        borderColor: active ? color : LEGACY_COLORS.border,
      }}
    >
      <div className={clsx(TYPO.caption, "font-semibold uppercase tracking-[1px]")} style={{ color: LEGACY_COLORS.muted2 }}>
        {label}
      </div>
      <div className={clsx(TYPO.display, "font-black tabular-nums")} style={{ color }}>
        {value}
      </div>
      <div className="h-[2px] w-full rounded-full" style={{ background: active ? color : `${color}40` }} />
    </button>
  );
}
