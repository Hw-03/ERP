import type {
  IoBundle,
  IoInternalUseBomMode,
  IoLine,
  IoPreviewTarget,
} from "@/lib/api";

export const INTERNAL_USE_BOM_MODE_LABEL: Record<IoInternalUseBomMode, string> = {
  parent_and_children: "상·하위 차감",
  children_only: "하위만 차감",
};

export function isInternalUseBomBundle(bundle: IoBundle): boolean {
  return bundle.source_kind === "bom_parent" && bundle.source_item_id != null;
}

export function hasUnselectedInternalUseBomMode(bundles: IoBundle[]): boolean {
  return bundles.some(
    (bundle) => isInternalUseBomBundle(bundle) && !bundle.internal_use_bom_mode,
  );
}

export function lineSelected(line: IoLine): boolean {
  return line.selected ?? line.included;
}

export function internalUseLineEffectLabel(line: IoLine): string {
  if (line.bom_stock_exempt) return "재고 미반영";
  if (!lineSelected(line)) {
    return line.included && line.direction === "in"
      ? "소속 부서 재입고"
      : "변동 없음";
  }
  return "출고";
}

export function buildInternalUseBomPreviewTarget(
  bundle: IoBundle,
  options: {
    mode?: IoInternalUseBomMode;
    toggleLineId?: string;
    bundleQuantity?: number;
  } = {},
): IoPreviewTarget {
  if (!bundle.source_item_id) {
    throw new Error("사용출고 BOM 원본 품목을 확인할 수 없습니다.");
  }
  const nextBundleQuantity = options.bundleQuantity ?? (Number(bundle.quantity) || 0);
  const componentSelections = bundle.lines
    .filter((line) => line.origin === "bom_auto")
    .map((line) => {
      return {
        item_id: line.item_id,
        selected:
          options.toggleLineId === line.line_id
            ? !lineSelected(line)
            : lineSelected(line),
      };
    });

  return {
    source_kind: "direct_item",
    source_location: bundle.source_location ?? "warehouse",
    item_id: bundle.source_item_id,
    quantity: nextBundleQuantity,
    internal_use_bom_mode:
      options.mode ?? bundle.internal_use_bom_mode ?? null,
    component_selections: componentSelections,
  };
}
