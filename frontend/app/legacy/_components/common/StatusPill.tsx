"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "../legacyUi";

export type StatusPillTone = "info" | "success" | "warning" | "danger" | "neutral";

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
      className={`inline-flex items-center gap-1.5 truncate rounded-full border px-3 py-1 text-xs font-bold ${className}`}
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

export function inferToneFromStatus(status: string | null | undefined): StatusPillTone {
  if (!status) return "info";
  if (status.startsWith("방금 완료")) return "success";
  if (/실패|오류|불러오지 못|에러/.test(status)) return "danger";
  if (/주의|경고|부족|품절/.test(status)) return "warning";
  return "info";
}
