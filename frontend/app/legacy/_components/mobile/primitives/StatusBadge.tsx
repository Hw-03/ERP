"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";
import { toMesTone, type MesTone } from "@/lib/mes-status";

// 모바일 StatusBadge 의 외부 시그니처 — "ok"/"warn" 등 구버전 톤도 그대로 받는다.
type Tone = "ok" | "warn" | "danger" | "info" | "muted";

// 내부 단일 소스: MesTone (success/warning/danger/info/neutral/muted) 기준 색.
// "neutral" 은 모바일에서 muted 와 시각적으로 동일하게 보이도록 muted 색을 사용.
const TONE_BY_MES: Record<MesTone, string> = {
  success: LEGACY_COLORS.green,
  warning: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  info: LEGACY_COLORS.blue,
  neutral: LEGACY_COLORS.muted,
  muted: LEGACY_COLORS.muted,
};

export function StatusBadge({
  label,
  tone = "info",
  color,
  className,
  dot = false,
}: {
  label: string;
  tone?: Tone;
  color?: string;
  className?: string;
  dot?: boolean;
}) {
  // toMesTone 으로 정규화 — "ok"→success, "warn"→warning. 외부 호출 시그니처 변화 없음.
  const c = color ?? TONE_BY_MES[toMesTone(tone)];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-[8px] px-2 py-[2px] font-semibold",
        TYPO.caption,
        className,
      )}
      style={{ background: `${c}22`, color: c }}
    >
      {dot ? <span className="h-[6px] w-[6px] rounded-full" style={{ background: c }} /> : null}
      {label}
    </span>
  );
}
