"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";

export interface AdminDetailTab {
  id: string;
  label: string;
}

export interface AdminDetailCardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  tabs?: AdminDetailTab[];
  activeTab?: string;
  onTabChange?: (id: string) => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function AdminDetailCard({
  title,
  subtitle,
  status,
  actions,
  tabs,
  activeTab,
  onTabChange,
  children,
  footer,
}: AdminDetailCardProps) {
  const tabInstanceId = useId();
  const hasTabs = Boolean(tabs?.length);
  const activeTabIndex = tabs?.findIndex((tab) => tab.id === activeTab) ?? -1;
  const selectedTabIndex = activeTabIndex >= 0 ? activeTabIndex : 0;
  const tabPanelId = `${tabInstanceId}-panel`;
  const hasHeaderContent = Boolean(title || subtitle || status);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!tabs || tabs.length === 0) return;

    let nextIndex: number | null = null;
    if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    onTabChange?.(tabs[nextIndex].id);
    document.getElementById(`${tabInstanceId}-tab-${nextIndex}`)?.focus();
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-[20px] border"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      {(hasHeaderContent || actions) && (
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {hasHeaderContent && (
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {title && (
                  <div className="text-[18px] font-black" style={{ color: LEGACY_COLORS.text }}>
                    {title}
                  </div>
                )}
                {status}
              </div>
              {subtitle && (
                <div className="mt-1 text-[12px]" style={{ color: LEGACY_COLORS.muted2 }}>
                  {subtitle}
                </div>
              )}
            </div>
          )}
          {actions && (
            <div
              className={hasHeaderContent
                ? "flex max-w-[60%] flex-wrap items-center justify-end gap-2"
                : "flex w-full flex-nowrap items-center justify-end gap-2 whitespace-nowrap"}
            >
              {actions}
            </div>
          )}
        </div>
      )}
      {hasTabs && (
        <div
          role="tablist"
          className="flex shrink-0 gap-2 border-b px-4 py-2"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {tabs?.map((tab, index) => {
            const active = index === selectedTabIndex;
            const tabId = `${tabInstanceId}-tab-${index}`;
            return (
              <button
                key={tab.id}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={tabPanelId}
                tabIndex={active ? 0 : -1}
                onClick={() => onTabChange?.(tab.id)}
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className="flex h-10 items-center justify-center rounded-[12px] border px-3 text-[14px] font-bold transition-colors hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--c-blue)]/30 active:scale-[0.98]"
                style={{
                  background: active
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 14%, transparent)`
                    : "transparent",
                  borderColor: active
                    ? `color-mix(in srgb, ${LEGACY_COLORS.blue} 40%, transparent)`
                    : "transparent",
                  color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      <div
        data-admin-detail-content
        role={hasTabs ? "tabpanel" : undefined}
        id={hasTabs ? tabPanelId : undefined}
        aria-labelledby={hasTabs ? `${tabInstanceId}-tab-${selectedTabIndex}` : undefined}
        className="min-h-0 flex-1 overflow-y-auto p-5 [scrollbar-gutter:stable]"
      >
        {children}
      </div>
      {footer && (
        <div
          className="shrink-0 border-t px-5 py-3"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
