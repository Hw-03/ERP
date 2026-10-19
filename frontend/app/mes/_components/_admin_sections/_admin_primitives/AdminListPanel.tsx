"use client";

import { useEffect, useRef, type AriaRole, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { SearchInput } from "../../common/SearchInput";

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
  listHeader?: ReactNode;
  listRole?: AriaRole;
  listAriaLabel?: string;
  listClassName?: string;
  externalScrollbar?: boolean;
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
  listHeader,
  listRole,
  listAriaLabel,
  listClassName,
  externalScrollbar = false,
}: AdminListPanelProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 드래그 중 마우스 휠로 스크롤 — HTML5 drag가 기본 스크롤을 막으므로 non-passive 리스너로 수동 처리.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      el!.scrollTop += e.deltaY;
      e.preventDefault();
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const listContent = <>
    {listHeader}
    {items.length === 0
      ? emptyState ?? <EmptyState variant="no-data" compact />
      : items.map((item) => renderItem(item))}
  </>;
  const viewport = <div
    ref={scrollRef}
    data-scrollbar-rail-viewport={externalScrollbar ? "" : undefined}
    role={listRole}
    aria-label={listAriaLabel}
    className={externalScrollbar
      ? `absolute inset-y-0 left-0 right-0 overflow-y-auto lg:-right-2.5 lg:[scrollbar-gutter:stable] ${listClassName ?? ""}`
      : listClassName ?? "flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-0.5"}
  >
    {externalScrollbar
      ? <div className="flex min-h-full min-w-full flex-col" style={{ background: LEGACY_COLORS.s1 }}>{listContent}</div>
      : listContent}
  </div>;

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
        <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 px-1 pt-1">
          <div className="flex items-baseline gap-2">
            {title && (
              <div className="whitespace-nowrap text-base font-black leading-6" style={{ color: LEGACY_COLORS.text }}>
                {title}
              </div>
            )}
            {countLabel && (
              <div className="whitespace-nowrap text-sm font-semibold leading-5 tabular-nums" style={{ color: LEGACY_COLORS.muted2 }}>
                {countLabel}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {onSearchChange && (
        <SearchInput value={searchValue ?? ""} onChange={onSearchChange} placeholder={searchPlaceholder}
          className="shrink-0 rounded-[12px]" inputProps={{ className: "placeholder:font-medium" }} />
      )}
      {filters && <div className="flex shrink-0 flex-wrap gap-1.5">{filters}</div>}
      {externalScrollbar ? <div data-scrollbar-rail-shell className="relative min-h-0 flex-1">
        {viewport}
        <div data-scrollbar-rail-frame aria-hidden className="pointer-events-none absolute inset-0 z-20 rounded-[20px] border" style={{ borderColor: LEGACY_COLORS.border }} />
        <div data-scrollbar-rail-masks aria-hidden className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
          <div className="flex justify-between">
            <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 100%, transparent 0 19px, var(--c-s1) 20px)" }} />
            <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 100%, transparent 0 19px, var(--c-s1) 20px)" }} />
          </div>
          <div className="flex justify-between">
            <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 100% 0, transparent 0 19px, var(--c-s1) 20px)" }} />
            <span className="h-5 w-5" style={{ background: "radial-gradient(circle at 0 0, transparent 0 19px, var(--c-s1) 20px)" }} />
          </div>
        </div>
      </div> : viewport}
      {footer && <div className="shrink-0 pt-1">{footer}</div>}
    </div>
  );
}
