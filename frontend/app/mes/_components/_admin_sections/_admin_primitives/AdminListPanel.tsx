"use client";

import { useEffect, useRef, type AriaRole, type ReactNode } from "react";
import { List } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { EmptyState } from "../../common/EmptyState";
import { SearchInput } from "../../common/SearchInput";
import { SkeletonBlock } from "../../common/LoadingSkeleton";
import { AdminReadBoundary, type useAdminReadState } from "./AdminReadState";
import { AdminVirtualRows, type AdminVirtualOptions } from "./AdminVirtualRows";
import { useAdminScrollRestoration } from "../../_admin_hooks/useAdminSessionState";

export interface AdminListPanelProps<T> {
  title?: string;
  countLabel?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  searchDisabled?: boolean;
  inlineSearch?: boolean;
  onSearchChange?: (value: string) => void;
  filters?: ReactNode;
  action?: ReactNode;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyState?: ReactNode;
  footer?: ReactNode;
  width?: number | string;
  listHeader?: ReactNode;
  listRole?: AriaRole;
  listAriaLabel?: string;
  listClassName?: string;
  externalScrollbar?: boolean;
  read?: ReturnType<typeof useAdminReadState>;
  skeleton?: ReactNode;
  virtual?: AdminVirtualOptions<T>;
}

export function AdminListPanel<T>({
  title,
  countLabel,
  searchValue,
  searchPlaceholder = "검색...",
  searchDisabled = false,
  inlineSearch = false,
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
  read,
  skeleton,
  virtual,
}: AdminListPanelProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchControl = onSearchChange ? <SearchInput disabled={searchDisabled} value={searchValue ?? ""} onChange={onSearchChange}
    ariaLabel={searchPlaceholder} placeholder={inlineSearch ? "검색" : searchPlaceholder}
    className={inlineSearch ? "min-w-0 flex-1 !min-h-9 rounded-[10px] [&_button]:!min-h-9" : "shrink-0 rounded-[12px]"}
    inputProps={{ className: `${inlineSearch ? "!h-9 " : ""}placeholder:font-medium` }} /> : null;
  useAdminScrollRestoration(`list.scroll:${listAriaLabel ?? title}`, scrollRef, !read?.loading);

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
    <AdminReadBoundary read={read ?? { loading: false, error: undefined, retry: () => {} }} skeleton={skeleton} label={listAriaLabel ?? title ?? "목록"}>
    {items.length === 0
      ? emptyState ?? <EmptyState variant="no-data" compact />
      : virtual ? <AdminVirtualRows {...virtual} items={items} renderItem={renderItem} scrollRef={scrollRef} />
      : items.map((item, index) => renderItem(item, index))}
    </AdminReadBoundary>
  </>;
  const viewport = <div
    ref={scrollRef}
    data-scrollbar-rail-viewport={externalScrollbar ? "" : undefined}
    role={listRole}
    aria-rowcount={listRole === "grid" ? items.length + (listHeader ? 1 : 0) : undefined}
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
        <div className={`flex ${inlineSearch ? "min-h-11" : "min-h-12"} shrink-0 items-center justify-between gap-2 rounded-[14px] border px-2`}
          style={{ background: LEGACY_COLORS.bg, borderColor: LEGACY_COLORS.border }}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {title && (
              <>
              <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                style={{ color: LEGACY_COLORS.blue, background: `color-mix(in srgb, ${LEGACY_COLORS.blue} 12%, transparent)` }}>
                <List className="h-[18px] w-[18px]" />
              </span>
              <div className={`min-w-0 ${inlineSearch ? "shrink-0" : ""} truncate text-base font-bold leading-6`} style={{ color: LEGACY_COLORS.text }}>
                {title}
              </div>
              </>
            )}
            {inlineSearch && searchControl}
            {countLabel && (
              <div className="ml-auto flex min-h-7 shrink-0 items-center justify-center whitespace-nowrap rounded-full border px-2 text-sm font-bold leading-5 tabular-nums"
                style={{ color: LEGACY_COLORS.blue, background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
                {read?.loading ? <SkeletonBlock className="h-4 w-10" /> : read?.error ? "—" : countLabel}
              </div>
            )}
          </div>
          {action}
        </div>
      )}
      {!inlineSearch && searchControl}
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
