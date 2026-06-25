"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";

export function StickyFooter({
  children,
  className,
  flat = false,
  compact = false,
}: {
  children: React.ReactNode;
  className?: string;
  // flat: 배경·상단 테두리·그림자를 제거해 버튼만 떠 보이게 한다(항목 4-4B·4-10A).
  // 기본 false → 기존 호출처는 현행 그대로.
  flat?: boolean;
  // compact: 하단 패딩을 줄여 버튼을 네비바 가까이 내린다(항목 8-3).
  // 기본 false → 기존 호출처는 현행 그대로.
  compact?: boolean;
}) {
  return (
    <div
      className={clsx("sticky bottom-0 z-30 px-4", compact ? "pt-2" : "pt-3", !flat && "border-t", className)}
      style={{
        background: flat ? LEGACY_COLORS.bg : LEGACY_COLORS.s1,
        borderColor: flat ? undefined : LEGACY_COLORS.border,
        paddingBottom: compact
          ? "calc(env(safe-area-inset-bottom, 0px) + 4px)"
          : "calc(env(safe-area-inset-bottom, 12px) + 12px)",
        boxShadow: flat ? undefined : "0 -12px 24px rgba(0,0,0,.24)",
      }}
    >
      {children}
    </div>
  );
}
