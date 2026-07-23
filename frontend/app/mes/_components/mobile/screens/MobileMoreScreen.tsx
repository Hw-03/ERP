"use client";

import { BarChart2, ClipboardCheck, MapPinned, PackageCheck, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import type { Operator } from "../../login/useCurrentOperator";
import { NotificationBell } from "../../notifications/NotificationBell";

export type MobileMoreEntryId = "assemblyChecklist" | "weekly" | "shipping" | "warehouseMap";

const MORE_ENTRIES: Record<
  MobileMoreEntryId,
  {
    icon: LucideIcon;
    label: string;
    description: string;
    accent: string;
  }
> = {
  assemblyChecklist: {
    icon: ClipboardCheck,
    label: "체크리스트",
    description: "제품별 조립 확인 목록",
    accent: LEGACY_COLORS.blue,
  },
  weekly: {
    icon: BarChart2,
    label: "주간보고",
    description: "생산·재고 주간 흐름",
    accent: LEGACY_COLORS.blue,
  },
  shipping: {
    icon: PackageCheck,
    label: "출하",
    description: "요청·준비·이력 조회",
    accent: LEGACY_COLORS.green,
  },
  warehouseMap: {
    icon: MapPinned,
    label: "창고 지도",
    description: "위치별 재고 조회",
    accent: LEGACY_COLORS.cyan,
  },
};

export function MobileMoreScreen({
  operator,
  onProfile,
  onNotificationNavigate,
  onChecklist,
  onWeekly,
  onShipping,
  onWarehouseMap,
  visibleEntries = ["assemblyChecklist", "shipping", "weekly", "warehouseMap"],
}: {
  operator: Operator | null;
  unreadCount?: number;
  onProfile: () => void;
  onNotificationNavigate: (tab: string, section: string | null) => void;
  onChecklist: () => void;
  onWeekly: () => void;
  onShipping: () => void;
  onWarehouseMap: () => void;
  visibleEntries?: MobileMoreEntryId[];
}) {
  const handlers: Record<MobileMoreEntryId, () => void> = {
    assemblyChecklist: onChecklist,
    weekly: onWeekly,
    shipping: onShipping,
    warehouseMap: onWarehouseMap,
  };
  const entries = visibleEntries.map((id) => ({ id, ...MORE_ENTRIES[id], onClick: handlers[id] }));

  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
      <div
        className="flex items-center gap-2 rounded-[18px] border p-2"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {operator && (
          <button
            type="button"
            onClick={onProfile}
            className="min-h-[64px] flex-1 rounded-[14px] px-3 text-left active:scale-[0.99]"
          >
            <span className="block min-w-0">
              <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                프로필
              </span>
              <span className="block truncate text-lg font-black leading-tight">{operator.name}</span>
            </span>
          </button>
        )}
        <div
          data-testid="mobile-more-notification-target"
          className="flex h-16 w-14 shrink-0 items-center justify-center [&_button]:h-12 [&_button]:w-12"
        >
          <NotificationBell onNavigate={onNotificationNavigate} suppressLoginDialog />
        </div>
      </div>

      {entries.length > 0 && (
        <div
          data-testid="mobile-more-menu-list"
          className={`overflow-hidden rounded-[18px] border${entries.length === 4 ? " flex min-h-0 flex-1 flex-col" : ""}`}
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          {entries.map((entry, index) => (
            <MenuRow
              key={entry.id}
              icon={entry.icon}
              label={entry.label}
              description={entry.description}
              accent={entry.accent}
              onClick={entry.onClick}
              divided={index > 0}
              fill={entries.length === 4}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  description,
  accent,
  onClick,
  divided,
  fill,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  accent: string;
  onClick: () => void;
  divided: boolean;
  fill: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-[92px] w-full items-center gap-5 border-t-0 px-4 py-4 text-left transition-[transform] active:scale-[0.99]${fill ? " flex-1" : ""}`}
      style={{
        borderTop: divided ? `1px solid ${LEGACY_COLORS.border}` : "none",
        color: LEGACY_COLORS.text,
      }}
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px]"
        style={{ background: `color-mix(in srgb, ${accent} 20%, transparent)` }}
      >
        <Icon
          className="h-7 w-7"
          style={{ color: `color-mix(in srgb, ${accent} 42%, ${LEGACY_COLORS.text})` }}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xl font-black leading-tight">{label}</span>
        <span className="block text-sm font-semibold" style={{ color: LEGACY_COLORS.muted2 }}>
          {description}
        </span>
      </span>
    </button>
  );
}
