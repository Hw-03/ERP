/**
 * 창고 지도 도메인 API — `@/lib/api/warehouse-map`.
 *
 * 보기(GET)는 공개. 박스·앵글 편집은 창고 정/부 관리자(warehouse_role) 인증
 * — api-core 가 X-Employee-Code + X-Operator-Pin 자동 주입(편집 모드 진입 시 등록).
 * box-tracking 토글만 admin PIN.
 */

import { deleteJson, fetcher, patchJson, postJson, putJson, toApiUrl } from "../api-core";

export type BoxSize = "LARGE" | "MEDIUM" | "SMALL";

export interface WarehouseAngle {
  id: number;
  label: string;
  rows: number;
  layers: number;
  jaris_per_cell: number;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  display_order: number;
  is_active: boolean;
}

export interface WarehouseBoxItem {
  item_id: string;
  mes_code: string | null;
  item_name: string;
  quantity: number;
  department: string | null;
  color_hex: string | null;
}

export interface WarehouseBox {
  box_id: string;
  angle_id: number;
  row_no: number;
  layer_no: number;
  jari_index: number;
  size: BoxSize;
  stack_order: number;
  items: WarehouseBoxItem[];
}

export interface WarehouseMap {
  angles: WarehouseAngle[];
  boxes: WarehouseBox[];
}

export interface ReconcileRow {
  item_id: string;
  mes_code: string | null;
  item_name: string;
  placed_total: number;
  warehouse_qty: number;
  diff: number;
  status: "ok" | "over" | "under";
}

export interface ReconcileResult {
  rows: ReconcileRow[];
  mismatch_count: number;
}

export interface BoxItemPayload {
  item_id: string;
  quantity: number;
}

export const warehouseMapApi = {
  getMap: () => fetcher<WarehouseMap>(toApiUrl("/api/warehouse-map/map")),
  getStructure: () => fetcher<WarehouseAngle[]>(toApiUrl("/api/warehouse-map/structure")),
  reconcile: (itemId?: string) => {
    const q = itemId ? `?item_id=${encodeURIComponent(itemId)}` : "";
    return fetcher<ReconcileResult>(toApiUrl(`/api/warehouse-map/reconcile${q}`));
  },
  getJari: (angleId: number, row: number, layer: number, jari: number) =>
    fetcher<WarehouseBox[]>(
      toApiUrl(`/api/warehouse-map/jari?angle_id=${angleId}&row=${row}&layer=${layer}&jari=${jari}`),
    ),

  // 구조 편집 (admin)
  createAngle: (payload: Partial<WarehouseAngle> & { label: string }) =>
    postJson<WarehouseAngle>(toApiUrl("/api/warehouse-map/angles"), payload),
  updateAngle: (id: number, payload: Partial<WarehouseAngle>) =>
    putJson<WarehouseAngle>(toApiUrl(`/api/warehouse-map/angles/${id}`), payload),
  deleteAngle: (id: number) =>
    deleteJson<void>(toApiUrl(`/api/warehouse-map/angles/${id}`)),
  reorderAngles: (items: { id: number; display_order: number }[]) =>
    patchJson<{ ok: boolean }>(toApiUrl("/api/warehouse-map/angles/reorder"), { items }),

  // 위치 배정 (admin)
  createBox: (payload: {
    angle_id: number;
    row_no: number;
    layer_no: number;
    jari_index: number;
    size: BoxSize;
    items: BoxItemPayload[];
  }) => postJson<WarehouseBox>(toApiUrl("/api/warehouse-map/boxes"), payload),
  updateBox: (boxId: string, payload: { size?: BoxSize; items?: BoxItemPayload[] }) =>
    putJson<WarehouseBox>(toApiUrl(`/api/warehouse-map/boxes/${boxId}`), payload),
  moveBox: (
    boxId: string,
    payload: { angle_id: number; row_no: number; layer_no: number; jari_index: number },
  ) => patchJson<WarehouseBox>(toApiUrl(`/api/warehouse-map/boxes/${boxId}/move`), payload),
  restackJari: (payload: {
    angle_id: number;
    row_no: number;
    layer_no: number;
    jari_index: number;
    box_ids: string[]; // 아래→위 최종 순서
  }) => patchJson<WarehouseBox[]>(toApiUrl("/api/warehouse-map/boxes/restack"), payload),
  deleteBox: (boxId: string) =>
    deleteJson<void>(toApiUrl(`/api/warehouse-map/boxes/${boxId}`)),
};
