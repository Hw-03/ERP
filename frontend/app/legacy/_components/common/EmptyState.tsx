"use client";

import { memo, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export type EmptyStateVariant = "no-data" | "no-search-result" | "filtered-out";

const VARIANT_DEFAULTS: Record<EmptyStateVariant, { title: string; description?: string }> = {
  "no-data": {
    title: "표시할 데이터가 없습니다",
    description: "데이터를 등록하면 이곳에 표시됩니다.",
  },
  "no-search-result": {
    title: "검색 결과가 없습니다",
    description: "검색어를 다시 확인하거나 필터를 조정해 보세요.",
  },
  "filtered-out": {
    title: "필터로 모든 항목이 가려졌습니다",
    description: "필터를 해제하면 다시 표시됩니다.",
  },
};

interface Props {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: { label: string; onClick: () => void };
  compact?: boolean;
  className?: string;
}

function EmptyStateImpl({
  variant = "no-data",
  title,
  description,
  icon,
  action,
  compact = false,
  className = "",
}: Props) {
  const fallback = VARIANT_DEFAULTS[variant];
  const finalTitle = title ?? fallback.title;
  const finalDescription = description ?? fallback.description;

  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${compact ? "py-6" : "py-12"} ${className}`}
      style={{ color: LEGACY_COLORS.muted2 }}
    >
      {icon && <div className="opacity-70">{icon}</div>}
      <div className={`${compact ? "text-sm" : "text-base"} font-bold`} style={{ color: LEGACY_COLORS.text }}>
        {finalTitle}
      </div>
      {finalDescription && (
        <div className={compact ? "text-[11px]" : "text-xs"} style={{ color: LEGACY_COLORS.muted2 }}>
          {finalDescription}
        </div>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 rounded-[12px] border px-3 py-1.5 text-xs font-bold transition-colors hover:brightness-125"
          style={{
            borderColor: `color-mix(in srgb, ${LEGACY_COLORS.blue} 30%, ${LEGACY_COLORS.border})`,
            color: LEGACY_COLORS.blue,
            background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 8%, transparent)`,
          }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export const EmptyState = memo(EmptyStateImpl);
