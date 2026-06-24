"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

/**
 * 모바일 PIN 입력 — numeric password + tracking-[0.4em].
 * OperatorMenuSheet · ApprovalQueuePanel · HistoryDetailSheet 공통.
 */
export function PinInput({
  label,
  value,
  onChange,
  maxLength = 8,
  placeholder = "••••",
  className,
}: {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <span
          className={`${TYPO.caption} font-semibold uppercase tracking-[1px]`}
          style={{ color: LEGACY_COLORS.muted2 }}
        >
          {label}
        </span>
      ) : null}
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) =>
          onChange(e.target.value.replace(/\D/g, "").slice(0, maxLength))
        }
        className={clsx(
          TYPO.title,
          "rounded-[14px] border px-4 py-3 font-black tabular-nums tracking-[0.4em] outline-none",
        )}
        style={{
          background: LEGACY_COLORS.s2,
          borderColor: LEGACY_COLORS.border,
          color: LEGACY_COLORS.text,
        }}
        placeholder={placeholder}
      />
    </label>
  );
}
