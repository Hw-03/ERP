import type { DefectLocation } from "@/lib/api/types/defects";

const SEARCH_FIELDS: (keyof DefectLocation)[] = [
  "item_name",
  "mes_code",
  "department",
  "reason_category",
  "reason_memo",
  "quarantined_by",
];

export function matchesDefectSearch(location: DefectLocation, query: string): boolean {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return true;
  return SEARCH_FIELDS.some((field) => String(location[field] ?? "").toLowerCase().includes(keyword));
}
