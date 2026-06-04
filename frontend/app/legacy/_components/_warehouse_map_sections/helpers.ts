/**
 * 창고 지도 — 순수 헬퍼 (프로토타입 로직 이식).
 * 박스 그룹핑·부서색 집계·자리 스택 계산.
 */
import type { WarehouseBox, WarehouseBoxItem } from "@/lib/api/warehouse-map";
import { getDepartmentFallbackColor } from "@/lib/mes-department";

export const SIZE_UNIT: Record<string, number> = { LARGE: 3, MEDIUM: 2, SMALL: 1 };
export const SIZE_LABEL: Record<string, string> = { LARGE: "대", MEDIUM: "중", SMALL: "소" };
export const JARI_CAPACITY = 3;

export const cellKey = (a: number, r: number, l: number) => `${a}-${r}-${l}`;

/** 박스 목록 → 칸(angle,row,layer) 단위 인덱스. */
export function buildCellIndex(boxes: WarehouseBox[]): Map<string, WarehouseBox[]> {
  const idx = new Map<string, WarehouseBox[]>();
  for (const b of boxes) {
    const k = cellKey(b.angle_id, b.row_no, b.layer_no);
    const arr = idx.get(k);
    if (arr) arr.push(b);
    else idx.set(k, [b]);
  }
  return idx;
}

/** 칸의 박스들을 자리(jari) 인덱스별 스택으로. 각 스택은 stack_order 오름차순(아래→위). */
export function jariStacks(cellBoxes: WarehouseBox[] | undefined, jarisPerCell: number): WarehouseBox[][] {
  const stacks: WarehouseBox[][] = Array.from({ length: jarisPerCell }, () => []);
  for (const b of cellBoxes ?? []) {
    if (b.jari_index >= 0 && b.jari_index < jarisPerCell) stacks[b.jari_index].push(b);
  }
  for (const s of stacks) s.sort((a, b) => a.stack_order - b.stack_order);
  return stacks;
}

export const stackUnits = (boxes: WarehouseBox[]): number =>
  boxes.reduce((sum, b) => sum + (SIZE_UNIT[b.size] ?? 1), 0);

/** 품목 목록 → 대표 부서색 (수량 가중 최빈 부서). 빈 목록이면 null. */
export function dominantColor(items: WarehouseBoxItem[]): string | null {
  if (!items.length) return null;
  const tally: Record<string, { qty: number; color: string | null; dept: string }> = {};
  for (const it of items) {
    const dept = it.department || "기타";
    if (!tally[dept]) tally[dept] = { qty: 0, color: it.color_hex, dept };
    tally[dept].qty += it.quantity || 1;
    if (it.color_hex) tally[dept].color = it.color_hex;
  }
  const top = Object.values(tally).sort((a, b) => b.qty - a.qty || a.dept.localeCompare(b.dept))[0];
  return top.color ?? getDepartmentFallbackColor(top.dept);
}

export const boxColor = (box: WarehouseBox): string | null => dominantColor(box.items);

/** 칸 전체의 대표 부서색 (미니맵·검색 바 용). */
export function cellColor(cellBoxes: WarehouseBox[] | undefined): string | null {
  if (!cellBoxes?.length) return null;
  return dominantColor(cellBoxes.flatMap((b) => b.items));
}

export const cellOccupied = (cellBoxes: WarehouseBox[] | undefined): boolean =>
  !!cellBoxes && cellBoxes.length > 0;
