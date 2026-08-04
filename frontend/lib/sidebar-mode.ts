export const SIDEBAR_MODES = ["hover", "collapsed", "expanded"] as const;

export type SidebarMode = (typeof SIDEBAR_MODES)[number];

/** Converts persisted or server-provided values into the supported sidebar modes. */
export function normalizeSidebarMode(value: unknown): SidebarMode | null {
  return typeof value === "string" && SIDEBAR_MODES.includes(value as SidebarMode)
    ? (value as SidebarMode)
    : null;
}
