"use client";

import { BarChart2, ClipboardCheck, ClipboardList, MapPinned, PackageCheck, type LucideIcon } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DESKTOP_TAB_ICON_COLORS } from "../../DesktopSidebar";
import type { Operator } from "../../login/useCurrentOperator";
import { NotificationBell } from "../../notifications/NotificationBell";
import type { NotificationNavigationTarget } from "../../notifications/NotificationBell";
import presentation from "../mobilePresentation.module.css";
import { MobilePageHeader } from "../primitives/MobilePageHeader";

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
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <MobilePageHeader className="mx-3" title={operator?.name ?? "더보기"} subtitle={operator ? "프로필" : undefined} onTitleClick={operator ? onProfile : undefined} right={
        <div
          data-testid="mobile-more-notification-target"
          className="flex h-11 w-11 shrink-0 items-center justify-center [&>div>button]:h-11 [&>div>button]:w-11 [&>div>button>svg]:h-5 [&>div>button>svg]:w-5"
        >
          <NotificationBell onNavigate={onNotificationNavigate} loginDialogEnabled={false} mobilePresentation />
        </div>
      } />

      <div className="scrollbar-hide flex min-h-0 flex-1 flex-col overflow-y-auto px-3">
      {entries.length > 0 && (
        <div
          data-testid="mobile-more-menu-list"
          className={`${presentation.choiceList} ${presentation.separatedChoices}`}
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
    </button>
  );
}
