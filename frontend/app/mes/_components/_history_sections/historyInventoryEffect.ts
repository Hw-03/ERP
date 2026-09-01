export type InventoryEffectScope =
  | "warehouse"
  | "location"
  | "warehouse_box"
  | "warehouse_zone"
  | "warehouse_unplaced";

export type InventoryEffectCell = {
  scope: string;
  delta: number | string;
  department?: string | null;
  status?: string | null;
  location_id?: string | null;
  row_id?: string | null;
  box_id?: string | null;
  zone_id?: string | number | null;
};

export type InventoryEffectOwner = {
  itemId: string;
  itemName: string;
  unit: string;
};

export type InventoryEffectRow = {
  key: string;
  scope: InventoryEffectScope;
  itemId: string;
  itemName: string;
  unit: string;
  locationId: string | null;
  rowId: string | null;
  boxId: string | null;
  zoneId: string | null;
  department: string | null;
  status: string | null;
  label: string;
  delta: number;
  deltaLabel: string;
};

const CANONICAL_SCOPES = new Set<InventoryEffectScope>([
  "warehouse",
  "location",
  "warehouse_box",
  "warehouse_zone",
  "warehouse_unplaced",
]);

function normalizeDelta(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value?: string | null): string | null {
  const text = value?.trim();
  return text || null;
}

function normalizeIdentifier(value?: string | number | null): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function cellLabel(
  scope: InventoryEffectScope,
  cell: InventoryEffectCell,
  locationId: string | null,
  boxId: string | null,
): string {
  if (scope === "warehouse") return "창고 재고";
  if (scope === "warehouse_box") return "박스 재고";
  if (scope === "warehouse_zone") return "특수구역 재고";
  if (scope === "warehouse_unplaced") return "미배치 재고";
  const department = normalizeText(cell.department);
  if (normalizeText(cell.status) === "DEFECTIVE") return "불량 재고";
  if (department) return `${department} 재고`;
  return locationId ? "재고" : "재고";
}

export function toInventoryEffectRows(
  effect: InventoryEffectCell[] | null | undefined,
  owner: InventoryEffectOwner,
): InventoryEffectRow[] {
  if (!effect?.length) return [];

  return effect.flatMap((cell) => {
    if (!CANONICAL_SCOPES.has(cell.scope as InventoryEffectScope)) return [];
    const scope = cell.scope as InventoryEffectScope;
    const delta = normalizeDelta(cell.delta);
    if (delta === 0) return [];

    const locationId = normalizeText(cell.location_id);
    const rowId = normalizeIdentifier(cell.row_id);
    const boxId = normalizeIdentifier(cell.box_id);
    const zoneId = normalizeIdentifier(cell.zone_id);
    const department = normalizeText(cell.department);
    const status = normalizeText(cell.status);
    let key = [
      owner.itemId,
      owner.unit,
      scope,
      locationId ?? "",
      department ?? "",
      status ?? "",
      boxId ?? "",
    ].join(":");
    if (rowId || zoneId) key += `:${zoneId ?? ""}:${rowId ?? ""}`;

    return [{
      key,
      scope,
      itemId: owner.itemId,
      itemName: owner.itemName,
      unit: owner.unit,
      locationId,
      rowId,
      boxId,
      zoneId,
      department,
      status,
      label: cellLabel(scope, cell, locationId, boxId),
      delta,
      deltaLabel: delta > 0 ? `+${delta}` : String(delta),
    }];
  });
}
