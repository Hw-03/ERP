"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "../../legacyUi";
import { TYPO } from "../tokens";

type Tone = "ok" | "warn" | "danger" | "info" | "muted";

const TONE: Record<Tone, string> = {
  ok: LEGACY_COLORS.green,
  warn: LEGACY_COLORS.yellow,
  danger: LEGACY_COLORS.red,
  info: LEGACY_COLORS.blue,
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
  const c = color ?? TONE[tone];
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
