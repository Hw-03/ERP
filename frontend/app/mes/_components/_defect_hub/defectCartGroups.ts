import type { Item } from "../_warehouse_v2/types";
import { defectSourceStock, type DefectSourceKind } from "./defectCartValidation";

export const MAX_QUARANTINE_LINES = 100;

export interface DefectCartGroupLine {
  key: string;
  item: Item;
  qty: string | number;
}

export interface DefectCartGroup<T extends DefectCartGroupLine> {
  item: Item;
  lines: T[];
  totalQuantity: number | null;
}

/** 저장 줄의 정체성과 순서를 보존하며 표시할 품목별 합계만 계산한다. */
export function groupDefectCartLines<T extends DefectCartGroupLine>(lines: readonly T[]): DefectCartGroup<T>[] {
  const groups = new Map<string, DefectCartGroup<T>>();
  for (const line of lines) {
    let group = groups.get(line.item.item_id);
    if (!group) {
      group = { item: line.item, lines: [], totalQuantity: 0 };
      groups.set(line.item.item_id, group);
    }
    group.lines.push(line);
    const quantity = Number(line.qty);
    group.totalQuantity = group.totalQuantity !== null && Number.isFinite(quantity) && quantity > 0
      ? group.totalQuantity + quantity
      : null;
  }
  return [...groups.values()];
}

/** 새 사유를 같은 품목의 마지막 줄 뒤에 넣어 화면과 제출 순서를 일치시킨다. */
export function insertDefectCartLine<T extends DefectCartGroupLine>(lines: readonly T[], line: T): T[] {
  let insertion = lines.length;
  for (let index = lines.length - 1; index >= 0; index--) {
    if (lines[index].item.item_id === line.item.item_id) {
      insertion = index + 1;
      break;
    }
  }
  return [...lines.slice(0, insertion), line, ...lines.slice(insertion)];
}

/** 출처가 공통인 카트에서 여러 사유가 같은 가용 재고를 중복 사용하지 못하게 한다. */
export function defectCartGroupErrors<T extends DefectCartGroupLine>(groups: readonly DefectCartGroup<T>[], source: DefectSourceKind): Map<string, string> {
  const errors = new Map<string, string>();
  for (const group of groups) {
    if (group.lines.length < 2 || group.totalQuantity === null) continue;
    const stock = defectSourceStock(group.item, source);
    if (group.totalQuantity > stock.available) {
      errors.set(group.item.item_id, `사유 합계 ${group.totalQuantity}개는 ${stock.locationLabel} 가용 ${stock.available}개보다 ${group.totalQuantity - stock.available}개 많습니다.`);
    }
  }
  return errors;
}
