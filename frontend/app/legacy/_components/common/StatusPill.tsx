"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "../legacyUi";
import { inferTone, type MesTone } from "@/lib/mes-status";

// 기존 prop 타입을 깨지 않기 위한 alias — MesTone 의 부분 집합.
export type StatusPillTone = Extract<MesTone, "info" | "success" | "warning" | "danger" | "neutral">;

const TONE_COLOR: Record<StatusPillTone, string> = {
  info: LEGACY_COLORS.blue,
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  neutral: LEGACY_COLORS.muted2,
};

interface Props {
  label: string;
  tone?: StatusPillTone;
  showDot?: boolean;
  maxWidth?: number | string;
  className?: string;
  title?: string;
}

function StatusPillImpl({
  label,
  tone = "info",
  showDot = true,
  maxWidth = 260,
  className = "",
  title,
}: Props) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 truncate rounded-full border px-3 py-2 text-xs font-bold ${className}`}
      style={{
        color,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 30%, transparent)`,
        maxWidth,
      }}
      title={title ?? label}
    >
      {showDot && (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

export const StatusPill = memo(StatusPillImpl);

/**
 * 자유 텍스트 상태 → tone 추론.
 * mes-status.ts::inferTone 의 wrapper. MesTone 중 "muted" 는 본 컴포넌트가 지원하지 않아
 * "neutral" 로 떨어뜨린다.
 */
export function inferToneFromStatus(status: string | null | undefined): StatusPillTone {
  const tone = inferTone(status);
  return tone === "muted" ? "neutral" : tone;
}
