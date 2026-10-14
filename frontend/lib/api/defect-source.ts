import type { DefectLocation } from "./types/defects";

/** Keep current stock rows distinct from historical occurrence records. */
export function defectLocationId(location: DefectLocation): string {
  const id = location.pool_id ?? location.record_id;
  if (!id) throw new Error("불량 재고 식별자가 없습니다.");
  return id;
}

/** Select exactly one source understood by defect and stock-request APIs. */
export function defectSource(location: DefectLocation): { pool_id: string } | { record_id: string } {
  if (location.pool_id) return { pool_id: location.pool_id };
  if (location.record_id) return { record_id: location.record_id };
  throw new Error("불량 재고 출처가 없습니다.");
}
