"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

// 모바일 전용 primitive. 데스크탑 대응물은 common/FilterChip.tsx — 의도적 플랫폼 분리이므로 통합하지 않는다.
// (현재 화면 소비처는 없으나 모바일 디자인 시스템 카탈로그의 예약 primitive.)
export function FilterChip({
  label,
  active,
  onClick,
  color,
  className,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color?: string;
  className?: string;
}) {
  const activeColor = color ?? LEGACY_COLORS.blue;
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "shrink-0 rounded-full border px-3 py-[6px] font-semibold transition-all duration-150 active:scale-95",
        TYPO.caption,
        className,
      )}
      style={
        active
          ? { background: activeColor, borderColor: activeColor, color: LEGACY_COLORS.white }
          : { background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }
      }
    >
      {label}
    </button>
  );
}

export function FilterChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx("flex gap-2 overflow-x-auto scrollbar-hide pb-[2px]", className)}>{children}</div>
  );
}
