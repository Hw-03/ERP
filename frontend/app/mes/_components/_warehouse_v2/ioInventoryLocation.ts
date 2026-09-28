import type { IoBundle, IoLine, IoSubType } from "./types";
import { isWarehouseAdjustSubType, processBomEffectLine } from "./ioWorkType";

export interface IoInventoryLocation {
  label: string;
  value: string;
}

function bucketLocation(bucket: IoLine["from_bucket"], department: string | null): string | null {
  if (bucket === "none") return null;
  if (bucket === "warehouse") return "창고";
  const name = department?.trim();
  if (!name) return "위치 확인 필요";
  return bucket === "defective" ? `${name} 불량` : name;
}

/** 실제 반영 행만 표시한다. 품목 분류나 기본 부서로 위치를 추정하지 않는다. */
export function lineInventoryLocation(line: IoLine | null, subType: IoSubType): IoInventoryLocation | null {
  if (!line || !line.included || line.bom_stock_exempt || Number(line.quantity) <= 0) return null;
  const from = bucketLocation(line.from_bucket, line.from_department);
  const to = bucketLocation(line.to_bucket, line.to_department);
  if (isWarehouseAdjustSubType(subType)) {
    return { label: "조정 위치", value: from ?? to ?? "위치 확인 필요" };
  }
  if (from && to) return { label: "이동 경로", value: `${from} → ${to}` };
  if (to) return { label: "입고 위치", value: to };
  if (from) return { label: "차감 위치", value: from };
  return { label: "재고 위치", value: "위치 확인 필요" };
}

/** 반영되는 상위를 우선하고, 요약용 상위는 변환된 하위 효과만 집계한다. */
export function bundleInventoryLocation(bundle: IoBundle, subType: IoSubType): IoInventoryLocation | null {
  const parent = bundle.source_kind === "bom_parent"
    ? bundle.lines.find((line) => line.origin === "direct")
    : undefined;
  if (parent) {
    const location = lineInventoryLocation(processBomEffectLine(subType, bundle, parent), subType);
    if (location) return location;
  }
  const locations = bundle.lines
    .filter((line) => line !== parent)
    .map((line) => lineInventoryLocation(processBomEffectLine(subType, bundle, line), subType))
    .filter((location): location is IoInventoryLocation => location !== null);
  if (locations.length === 0) return null;
  const labels = new Set(locations.map((location) => location.label));
  const values = new Set(locations.map((location) => location.value));
  const label = labels.size === 1 ? locations[0].label : "재고 위치";
  return {
    label,
    value: values.size === 1
      ? locations[0].value
      : `여러 위치 · ${values.size}개 ${label === "이동 경로" ? "경로" : "위치"}`,
  };
}
