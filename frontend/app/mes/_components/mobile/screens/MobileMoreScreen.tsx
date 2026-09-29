"use client";

import { BarChart2, ChevronRight, ClipboardCheck, ClipboardList, MapPinned, PackageCheck, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DESKTOP_TAB_ICON_COLORS } from "../../DesktopSidebar";
import type { Operator } from "../../login/useCurrentOperator";
import { NotificationBell } from "../../notifications/NotificationBell";
import type { NotificationNavigationTarget } from "../../notifications/NotificationBell";
import presentation from "../mobilePresentation.module.css";

export type MobileMoreEntryId = "assemblyChecklist" | "dailyReport" | "weekly" | "shipping" | "warehouseMap";

const MORE_ENTRIES: Record<
  MobileMoreEntryId,
  {
    icon: LucideIcon;
    label: string;
    accent: string;
  }
> = {
  assemblyChecklist: {
    icon: ClipboardCheck,
    label: "체크리스트",
    accent: LEGACY_COLORS.blue,
  },
  dailyReport: {
    icon: ClipboardList,
    label: "일일 작업 일보",
    accent: DESKTOP_TAB_ICON_COLORS.dailyReport,
  },
  weekly: {
    icon: BarChart2,
    label: "주간보고",
    accent: DESKTOP_TAB_ICON_COLORS.weekly,
  },
  shipping: {
    icon: PackageCheck,
    label: "출하",
    accent: DESKTOP_TAB_ICON_COLORS.shipping,
  },
  warehouseMap: {
    icon: MapPinned,
    label: "창고 지도",
    accent: DESKTOP_TAB_ICON_COLORS.warehouseMap,
  },
};

export function MobileMoreScreen({
  operator,
  onProfile,
  onNotificationNavigate,
  onChecklist,
  onDailyReport,
  onWeekly,
  onShipping,
  onWarehouseMap,
  visibleEntries = ["assemblyChecklist", "dailyReport", "shipping", "weekly", "warehouseMap"],
}: {
  operator: Operator | null;
  unreadCount?: number;
  onProfile: () => void;
  onNotificationNavigate: (target: NotificationNavigationTarget) => void;
  onChecklist: () => void;
  onDailyReport: () => void;
  onWeekly: () => void;
  onShipping: () => void;
  onWarehouseMap: () => void;
  visibleEntries?: MobileMoreEntryId[];
}) {
  const handlers: Record<MobileMoreEntryId, () => void> = {
    assemblyChecklist: onChecklist,
    dailyReport: onDailyReport,
    weekly: onWeekly,
    shipping: onShipping,
    warehouseMap: onWarehouseMap,
  };
  const entries = visibleEntries.map((id) => ({ id, ...MORE_ENTRIES[id], onClick: handlers[id] }));

  return (
    <div className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3">
      <div
        className="flex shrink-0 items-center gap-2 rounded-[20px] border p-2"
        style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
      >
        {operator && (
          <button
            type="button"
            onClick={onProfile}
            className="min-h-[60px] min-w-0 flex-1 rounded-[14px] px-3 text-left active:scale-[0.99]"
          >
            <span className="block min-w-0">
              <span className="block text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
                프로필
              </span>
              <span className="block break-words text-[15px] font-semibold leading-5">{operator.name}</span>
            </span>
          </button>
        )}
        <div
          data-testid="mobile-more-notification-target"
          className="flex h-11 w-11 shrink-0 items-center justify-center [&>div>button]:h-11 [&>div>button]:w-11"
        >
          <NotificationBell onNavigate={onNotificationNavigate} loginDialogEnabled={false} mobilePresentation />
        </div>
      </div>

      {entries.length > 0 && (
        <div
          data-testid="mobile-more-menu-list"
          className={`${presentation.surface} ${presentation.choiceList}`}
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          {entries.map((entry) => (
            <MenuRow
              key={entry.id}
              icon={entry.icon}
              label={entry.label}
              accent={entry.accent}
              onClick={entry.onClick}
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
  accent,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={presentation.menuRow}
      style={{
        color: LEGACY_COLORS.text,
      }}
    >
      <span
        className={presentation.choiceIcon}
        style={{ color: accent }}
      >
        <Icon aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block leading-snug">{label}</span>
      </span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0" style={{ color: LEGACY_COLORS.muted2 }} />
    </button>
  );
}
