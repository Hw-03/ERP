"use client";

import type { ReactNode } from "react";
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
  return (
    <div
      className="flex min-h-0 flex-1 flex-col rounded-[20px] border"
      style={{
        background: LEGACY_COLORS.s1,
        borderColor: LEGACY_COLORS.border,
      }}
    >
      {(title || actions) && (
        <div
          className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
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
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {tabs && tabs.length > 0 && (
        <div
          role="tablist"
          className="flex shrink-0 gap-2 border-b px-4 pt-2"
          style={{ borderColor: LEGACY_COLORS.border }}
        >
          {tabs.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange?.(tab.id)}
                className="relative px-2.5 py-2 text-[14px] font-bold transition-colors"
                style={{
                  color: active ? LEGACY_COLORS.blue : LEGACY_COLORS.muted2,
                }}
              >
                {tab.label}
                {active && (
                  <span
                    className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-t-full"
                    style={{ background: LEGACY_COLORS.blue }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
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
