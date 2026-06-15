/**
 * 생산 가능 수량(AF) 표시용 집계 헬퍼 — `@/lib/mes/capacity`.
 *
 * 백엔드 `af.items`(AF 1종 단위)를 화면용으로 model_symbol 단위로 묶는다.
 * 패널(모델별 칩)과 상세 모달(모델 그룹 헤더 합계)이 공유한다.
 */
import type { ProductionCapacityAfItem } from "@/lib/api/types/production";
import { getModelLabel } from "@/lib/mes/model-labels";

export interface ModelCapacityGroup {
  /** 그룹 키 = model_symbol (없으면 "미분류"). */
  key: string;
  /** 표시명 = getModelLabel(model_symbol) 또는 "미분류". */
  label: string;
  /** 이 모델에 속한 AF 항목들 (ship_ready 내림차순). */
  items: ProductionCapacityAfItem[];
  /** 모델 내 AF 합계. 공유 자재가 있으면 동시 보장은 아님(표시용 합산). */
  totals: {
    ship_ready: number;
    fast_assembly: number;
    total_production: number;
  };
}

const UNCLASSIFIED = "미분류";

/**
 * AF 항목을 model_symbol 단위로 그룹화하고 3수량을 합산한다.
 * 정렬: model_symbol 숫자 오름차순(미분류는 항상 끝).
 */
export function groupAfByModel(
  items: ProductionCapacityAfItem[],
): ModelCapacityGroup[] {
  const groups = new Map<string, ProductionCapacityAfItem[]>();
  for (const it of items) {
    const key = (it.model_symbol ?? "").trim() || UNCLASSIFIED;
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  return Array.from(groups.entries())
    .map(([key, arr]) => {
      const sorted = [...arr].sort((a, b) => b.ship_ready - a.ship_ready);
      const totals = arr.reduce(
        (acc, it) => {
          acc.ship_ready += it.ship_ready;
          acc.fast_assembly += it.fast_assembly;
          acc.total_production += it.total_production;
          return acc;
        },
        { ship_ready: 0, fast_assembly: 0, total_production: 0 },
      );
      const label =
        key === UNCLASSIFIED ? UNCLASSIFIED : getModelLabel(key, sorted[0]?.af_name) || `모델${key}`;
      return { key, label, items: sorted, totals };
    })
    .sort((a, b) => {
      // 미분류는 항상 끝으로.
      if (a.key === UNCLASSIFIED) return 1;
      if (b.key === UNCLASSIFIED) return -1;
      return a.key.localeCompare(b.key, undefined, { numeric: true });
    });
}
