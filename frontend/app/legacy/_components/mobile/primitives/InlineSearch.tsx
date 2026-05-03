"use client";

import clsx from "clsx";
import { Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export function InlineSearch({
  value,
  onChange,
  placeholder = "검색",
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <div
      className={clsx(
        "flex items-center gap-2 rounded-[14px] border px-3",
        className,
      )}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      <Search size={16} color={LEGACY_COLORS.muted} strokeWidth={2} />
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={clsx("h-10 min-w-0 flex-1 bg-transparent outline-none", TYPO.body)}
        style={{ color: LEGACY_COLORS.text }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="검색어 지우기"
          className="shrink-0 rounded-full p-1"
          style={{ color: LEGACY_COLORS.muted }}
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
