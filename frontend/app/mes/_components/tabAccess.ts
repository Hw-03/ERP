import type { StocktakeMenuVisibility } from "@/lib/api/types/stocktake";
import { canManageStocktakeRounds } from "./stocktake/stocktakeAuthority";

export const SIDEBAR_TAB_IDS = [
  "dashboard",
  "stocktake",
  "warehouse",
  "shipping",
  "warehouseMap",
  "defect",
  "history",
  "dailyReport",
  "weekly",
  "admin",
] as const;

export type SidebarTabId = (typeof SIDEBAR_TAB_IDS)[number];
/** 설정은 직원별 표시 탭 권한과 무관하게 항상 사용할 수 있는 데스크톱 유틸리티 탭이다. */
export type DesktopTabId = SidebarTabId | "settings";

export const IO_RELATED_SIDEBAR_TAB_IDS = ["warehouse", "defect"] as const;

export const MOBILE_MORE_ENTRY_TAB_IDS = ["stocktake", "dailyReport", "weekly", "shipping", "warehouseMap"] as const;

type TabAccessSource = {
  hidden_sidebar_tabs?: readonly string[] | null;
  department?: string;
  department_role?: string;
} | null | undefined;

const SIDEBAR_TAB_ID_SET = new Set<string>(SIDEBAR_TAB_IDS);

function normalizeIoRelatedHiddenTabs(tabs: SidebarTabId[]): SidebarTabId[] {
  if (!tabs.some((tab) => IO_RELATED_SIDEBAR_TAB_IDS.includes(tab as "warehouse" | "defect"))) return tabs;
  const hidden = new Set(tabs);
  IO_RELATED_SIDEBAR_TAB_IDS.forEach((tab) => hidden.add(tab));
  return SIDEBAR_TAB_IDS.filter((tab) => hidden.has(tab));
}

export function normalizeHiddenSidebarTabs(raw: readonly string[] | null | undefined): SidebarTabId[] {
  if (!raw) return [];
  const tabs: SidebarTabId[] = [];
  raw.forEach((value) => {
    if (!SIDEBAR_TAB_ID_SET.has(value)) return;
    const tab = value as SidebarTabId;
    if (!tabs.includes(tab)) tabs.push(tab);
  });
  return normalizeIoRelatedHiddenTabs(tabs);
}

/** Bulk saves update personal settings; the token-bound response resolves stale login snapshots. */
export function isSidebarTabVisible(tab: SidebarTabId, source: TabAccessSource, stocktakeMenu?: StocktakeMenuVisibility): boolean {
  if (tab === "stocktake") {
    if (!source) return false;
    if (stocktakeMenu) return stocktakeMenu.employee_visible;
    return canManageStocktakeRounds(source)
      && !normalizeHiddenSidebarTabs(source.hidden_sidebar_tabs).includes(tab);
  }
  if (normalizeHiddenSidebarTabs(source?.hidden_sidebar_tabs).includes(tab)) return false;
  return true;
}

export function filterVisibleSidebarTabs<T extends SidebarTabId>(tabs: readonly T[], source: TabAccessSource, stocktakeMenu?: StocktakeMenuVisibility): T[] {
  return tabs.filter((tab) => isSidebarTabVisible(tab, source, stocktakeMenu));
}

export function firstVisibleSidebarTab(source: TabAccessSource): SidebarTabId {
  return filterVisibleSidebarTabs(SIDEBAR_TAB_IDS, source)[0] ?? "dashboard";
}

export function mobileMoreHasVisibleEntries(source: TabAccessSource, stocktakeMenu?: StocktakeMenuVisibility): boolean {
  return MOBILE_MORE_ENTRY_TAB_IDS.some((tab) => isSidebarTabVisible(tab, source, stocktakeMenu));
}
export function setSidebarTabVisible(
  hiddenTabs: readonly string[] | null | undefined,
  tab: SidebarTabId,
  visible: boolean,
): SidebarTabId[] {
  const hidden = new Set<SidebarTabId>(normalizeHiddenSidebarTabs(hiddenTabs));
  const targets = IO_RELATED_SIDEBAR_TAB_IDS.includes(tab as "warehouse" | "defect")
    ? IO_RELATED_SIDEBAR_TAB_IDS
    : [tab];

  targets.forEach((target) => {
    if (visible) hidden.delete(target);
    else hidden.add(target);
  });

  return SIDEBAR_TAB_IDS.filter((id) => hidden.has(id));
}
