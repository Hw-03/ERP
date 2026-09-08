import type { DefectLocation } from "@/lib/api/types/defects";
import type { Item, ProductModel } from "../_warehouse_v2/types";
import type { DefectProcessStep } from "./DefectFilterBar";

export interface DefectCategorySelection {
  departments: readonly string[];
  models: readonly string[];
  processSteps: readonly DefectProcessStep[];
}

/** 부서·모델·공정은 그룹 안에서 OR, 그룹 사이 AND. 불용은 별도 품목 조건으로 교집합한다. */
export function filterDefectLocations(
  locations: readonly DefectLocation[],
  items: readonly Item[],
  productModels: readonly ProductModel[],
  selection: DefectCategorySelection,
): DefectLocation[] {
  const itemById = new Map(items.map((item) => [item.item_id, item]));
  const selectedSlots = new Set(
    productModels
      .filter((model) => model.model_name && selection.models.includes(model.model_name))
      .map((model) => model.slot),
  );
  const includeUnclassifiedModel = selection.models.includes("미분류");

  return locations.filter((location) => {
    if (selection.departments.length > 0 && !selection.departments.includes(location.department)) {
      return false;
    }

    const item = itemById.get(location.item_id);
    if (selection.processSteps.includes("DISUSED") && item?.legacy_item_type !== "불용") return false;
    if (selection.models.length > 0) {
      const modelSlots = item?.model_slots ?? [];
      const modelMatches = modelSlots.some((slot) => selectedSlots.has(slot));
      if (!modelMatches && !(includeUnclassifiedModel && modelSlots.length === 0)) return false;
    }

    if (selection.processSteps.some((step) => step !== "DISUSED")) {
      const stage = item?.process_type_code?.slice(-1).toUpperCase() ?? "";
      const classified = stage === "R" || stage === "A" || stage === "F";
      const processMatches = classified
        ? selection.processSteps.includes(stage)
        : selection.processSteps.includes("UNCLASSIFIED");
      if (!processMatches) return false;
    }

    return true;
  });
}
