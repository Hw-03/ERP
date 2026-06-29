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

export const IO_RELATED_SIDEBAR_TAB_IDS = ["warehouse", "defect"] as const;

export const MOBILE_MORE_ENTRY_TAB_IDS = ["weekly", "shipping", "warehouseMap"] as const;

type TabAccessSource = {
  hidden_sidebar_tabs?: readonly string[] | null;
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
