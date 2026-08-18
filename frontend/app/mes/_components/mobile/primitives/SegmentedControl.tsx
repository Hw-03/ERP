"use client";

import clsx from "clsx";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { TYPO } from "../tokens";

export interface SegmentedTab<T extends string = string> {
  id: T;
  label: string;
  badge?: string | number | null;
}

/**
 * Mobile segmented tab control shared by active mobile screens.
 */
export function SegmentedControl<T extends string>({
  tabs,
  active,
  onChange,
  className,
  size = "md",
}: {
  tabs: SegmentedTab<T>[];
  active: T;
  onChange: (next: T) => void;
  className?: string;
  /** 기본은 기존 md이며, lg는 필요한 화면에서만 opt-in한다. */
  size?: "md" | "lg";
}) {
  return (
    <div
      role="tablist"
      className={clsx("flex gap-1 rounded-[14px] border", size === "lg" ? "p-1.5" : "p-1", className)}
      style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={clsx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[10px] font-bold transition-[background-color]",
              // lg는 해당 화면의 다른 버튼 높이와 맞춘 패딩을 사용한다.
              size === "lg" ? "px-3 py-4" : "px-2 py-[7px]",
              size === "lg" ? TYPO.title : TYPO.caption,
            )}
            style={{
              background: isActive ? (LEGACY_COLORS.s1 as string) : "transparent",
              color: isActive
                ? (LEGACY_COLORS.text as string)
                : (LEGACY_COLORS.muted2 as string),
              boxShadow: isActive ? "0 1px 6px rgba(0,0,0,.25)" : undefined,
            }}
          >
            <span className="truncate">{tab.label}</span>
            {tab.badge != null && tab.badge !== "" && tab.badge !== 0 ? (
              <span
                className="rounded-full px-1.5 py-[1px] text-[11px] font-black tabular-nums"
                style={{
                  background: isActive
                    ? `${LEGACY_COLORS.blue as string}26`
                    : `${LEGACY_COLORS.muted as string}33`,
                  color: isActive
                    ? (LEGACY_COLORS.blue as string)
                    : (LEGACY_COLORS.muted2 as string),
                }}
              >
                {tab.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}



