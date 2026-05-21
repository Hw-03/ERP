"use client";

import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";

export interface AdminListPanelProps<T> {
  title?: string;
  countLabel?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  action?: ReactNode;
  items: T[];
  renderItem: (item: T) => ReactNode;
  emptyState?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
}

export function AdminListPanel<T>({
  title,
  countLabel,
  searchValue,
  searchPlaceholder = "검색...",
  onSearchChange,
  filters,
  action,
  items,
  renderItem,
  emptyState,
  footer,
  width = 320,
}: AdminListPanelProps<T>) {
  return (
    <div
      className="flex min-h-0 shrink-0 flex-col gap-3 rounded-[20px] border p-3"
      style={{
        width,
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      {(title || action) && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-1 pt-1">
          <div className="flex items-baseline gap-2">
            {title && (
              <div className="text-sm font-black" style={{ color: LEGACY_COLORS.text }}>
                {title}
              </div>
            )}
            {countLabel && (
              <div className="text-[11px] font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
                {countLabel}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {onSearchChange && (
        <div
          className="flex shrink-0 items-center gap-2 rounded-[12px] border px-3 py-2"
          style={{
            background: LEGACY_COLORS.s2,
            borderColor: LEGACY_COLORS.border,
          }}
        >
          <Search className="h-4 w-4" style={{ color: LEGACY_COLORS.muted2 }} />
          <input
            type="text"
            value={searchValue ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:font-medium"
            style={{ color: LEGACY_COLORS.text }}
          />
        </div>
      )}
      {filters && <div className="flex shrink-0 flex-wrap gap-1.5">{filters}</div>}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5">
        {items.length === 0
          ? emptyState ?? <EmptyState variant="no-data" compact />
          : items.map((item) => renderItem(item))}
      </div>
      {footer && <div className="shrink-0 pt-1">{footer}</div>}
    </div>
  );
}
