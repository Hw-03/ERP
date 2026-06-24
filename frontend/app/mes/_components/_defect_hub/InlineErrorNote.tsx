"use client";

import { memo, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

interface Props {
  children: ReactNode;
  /** 패딩/모서리 변형. compact=`px-3 py-2 rounded-[10px]`(폼 인라인), block=`px-6 py-4 rounded-[14px]`(목록 영역). */
  variant?: "compact" | "block";
  className?: string;
}

/**
 * 불량 탭 공용 인라인 에러 노트.
 *
 * 기존 여러 곳에 흩어져 있던 빨강 계열 인라인 hex 에러 박스 패턴(연빨강 배경 + 빨강 보더 + 빨강 글씨)을
 * 토큰화해 한 곳으로 모은다.
 *   - 배경 `LEGACY_COLORS.errorBg`(라이트/다크 대비 보장 토큰)
 *   - 보더 `tint(LEGACY_COLORS.red, 30)`
 *   - 텍스트 `LEGACY_COLORS.red`
 * 토큰만 쓰므로 다크모드에서도 자동 대응.
 */
function InlineErrorNoteImpl({ children, variant = "compact", className = "" }: Props) {
  const box = variant === "block" ? "rounded-[14px] px-6 py-4" : "rounded-[10px] px-3 py-2";
  return (
    <div
      className={`border text-xs font-bold ${box} ${className}`}
      style={{
        background: LEGACY_COLORS.errorBg,
        borderColor: tint(LEGACY_COLORS.red, 30),
        color: LEGACY_COLORS.red,
      }}
    >
      {children}
    </div>
  );
}

export const InlineErrorNote = memo(InlineErrorNoteImpl);
