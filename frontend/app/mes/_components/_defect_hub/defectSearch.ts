import type { DefectLocation } from "@/lib/api/types/defects";
import type { ItemSearchConfig } from "@/lib/api/types/item-search";
import { matchesItemSearchFields } from "@/lib/itemSearch";

const SEARCH_FIELDS: (keyof DefectLocation)[] = [
  "department",
  "reason_category",
  "reason_memo",
  "quarantined_by",
];

export function matchesDefectSearch(location: DefectLocation, query: string, config?: ItemSearchConfig): boolean {
  return matchesItemSearchFields({
    itemId: location.item_id,
    nameFields: [location.item_name],
    codeFields: [location.mes_code],
    literalFields: SEARCH_FIELDS.map((field) => String(location[field] ?? "")),
  }, query, config);
}
