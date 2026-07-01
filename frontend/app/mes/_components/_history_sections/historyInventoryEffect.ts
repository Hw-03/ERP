export type InventoryEffectCell = {
  scope: string;
  delta: number | string;
  department?: string | null;
  status?: string | null;
  box_id?: string | null;
};

export type InventoryEffectRow = {
  key: string;
  label: string;
  delta: number;
  deltaLabel: string;
};

function normalizeDelta(value: number | string): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function statusLabel(status?: string | null): string {
  switch (status) {
    case "PRODUCTION":
      return "생산";
    case "DEFECTIVE":
      return "불량";
    default:
      return status ?? "위치";
  }
}

function cellLabel(cell: InventoryEffectCell): string {
  if (cell.scope === "warehouse") return "창고";
  if (cell.scope === "warehouse_box") return "박스 재고";
  if (cell.scope === "box") return cell.box_id ? `박스 ${cell.box_id}` : "박스";
  if (cell.scope === "location") {
    const dept = cell.department ?? "부서";
    return `${dept} ${statusLabel(cell.status)}`;
  }
  return cell.scope || "재고";
}

export function toInventoryEffectRows(
  effect: InventoryEffectCell[] | null | undefined,
): InventoryEffectRow[] {
  if (!effect?.length) return [];
  return effect
    .map((cell) => {
      const delta = normalizeDelta(cell.delta);
      return {
        key: `${cell.scope}:${cell.department ?? ""}:${cell.status ?? ""}`,
        label: cellLabel(cell),
        delta,
        deltaLabel: delta > 0 ? `+${delta}` : String(delta),
      };
    })
    .filter((row) => row.delta !== 0);
}
