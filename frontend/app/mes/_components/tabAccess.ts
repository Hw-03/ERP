export const SIDEBAR_TAB_IDS = [
  "dashboard",
  "warehouse",
  "shipping",
  "warehouseMap",
  "defect",
  "history",
  "weekly",
  "admin",
] as const;

export type SidebarTabId = (typeof SIDEBAR_TAB_IDS)[number];
export type DesktopTabId = SidebarTabId;

export const MOBILE_MORE_ENTRY_TAB_IDS = ["weekly", "shipping", "warehouseMap"] as const;

type TabAccessSource = {
  hidden_sidebar_tabs?: readonly string[] | null;
} | null | undefined;

const SIDEBAR_TAB_ID_SET = new Set<string>(SIDEBAR_TAB_IDS);

export function normalizeHiddenSidebarTabs(raw: readonly string[] | null | undefined): SidebarTabId[] {
  if (!raw) return [];
  const tabs: SidebarTabId[] = [];
  raw.forEach((value) => {
    if (!SIDEBAR_TAB_ID_SET.has(value)) return;
    const tab = value as SidebarTabId;
    if (!tabs.includes(tab)) tabs.push(tab);
  });
  return tabs;
}

export function isSidebarTabVisible(tab: SidebarTabId, source: TabAccessSource): boolean {
  return !normalizeHiddenSidebarTabs(source?.hidden_sidebar_tabs).includes(tab);
}

export function filterVisibleSidebarTabs<T extends SidebarTabId>(tabs: readonly T[], source: TabAccessSource): T[] {
  return tabs.filter((tab) => isSidebarTabVisible(tab, source));
}

export function firstVisibleSidebarTab(source: TabAccessSource): SidebarTabId {
  return filterVisibleSidebarTabs(SIDEBAR_TAB_IDS, source)[0] ?? "dashboard";
}

export function mobileMoreHasVisibleEntries(source: TabAccessSource): boolean {
  return MOBILE_MORE_ENTRY_TAB_IDS.some((tab) => isSidebarTabVisible(tab, source));
}