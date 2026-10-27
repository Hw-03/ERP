import type { DefectManagementCategory } from "./api/types/defects";

export interface DefectEntryTarget {
  itemId: string;
  department: string;
  managementCategory: DefectManagementCategory;
}

const CATEGORY_VALUES: readonly string[] = ["DEFECT", "B_GRADE", "OBSOLETE"];
const ENTRY_PARAMS = ["defect_item_id", "defect_dept", "defect_category"] as const;

/** Incomplete links retain ordinary navigation; a category is never guessed. */
export function readDefectEntry(search: string): DefectEntryTarget | null {
  const params = new URLSearchParams(search);
  const itemId = params.get("defect_item_id")?.trim();
  const department = params.get("defect_dept")?.trim();
  const category = params.get("defect_category");
  return params.get("tab") === "defect" && itemId && department && category && CATEGORY_VALUES.includes(category)
    ? { itemId, department, managementCategory: category as DefectManagementCategory } : null;
}

export function defectEntryUrl(pathname: string, target: DefectEntryTarget): string {
  const params = new URLSearchParams({ tab: "defect", defect_item_id: target.itemId,
    defect_dept: target.department, defect_category: target.managementCategory });
  return `${pathname}?${params.toString()}`;
}

export function defectEntryView(target: DefectEntryTarget): "list" | "storage" {
  return target.managementCategory === "DEFECT" ? "list" : "storage";
}

/** Legacy department-only links remain supported; malformed item links cannot silently narrow a list. */
export function readDefectDepartment(search: string): string | null {
  const params = new URLSearchParams(search);
  if (params.has("defect_item_id") || params.has("defect_category")) return readDefectEntry(search)?.department ?? null;
  return params.get("defect_dept");
}

/** Preserve framework/mobile history fields when admitting a read-only inventory entry. */
export function defectEntryHistory(state: unknown, target: DefectEntryTarget): Record<string, unknown> {
  return { ...(state && typeof state === "object" ? state : {}), defect: defectEntryView(target) };
}

export function clearDefectEntryUrl(): void {
  const url = new URL(window.location.href);
  for (const name of ENTRY_PARAMS) url.searchParams.delete(name);
  window.history.replaceState({ ...window.history.state, defect: "hub" }, "", url);
}
