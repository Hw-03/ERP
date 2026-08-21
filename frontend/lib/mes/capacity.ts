/**
 * 생산 가능 수량(AF) 표시용 집계 헬퍼 — `@/lib/mes/capacity`.
 *
 * 백엔드 `af.items`(AF 1종 단위)를 화면용으로 model_symbol 단위로 묶는다.
 * 패널(모델별 칩)과 상세 모달(모델 그룹 헤더 합계)이 공유한다.
 */
import type {
  ProductionCapacityAfBlock,
  ProductionCapacityAfItem,
  ProductionCapacityPfVariant,
} from "@/lib/api/types/production";
import { getModelLabel } from "@/lib/mes/model-labels";

export interface ModelCapacityGroup {
  /** 그룹 키 = model_symbol (없으면 "미분류"). */
  key: string;
  /** 표시명 = getModelLabel(model_symbol) 또는 "미분류". */
  label: string;
  /** 이 모델에 속한 AF 항목들 (BOM 미등록·출하 경로 없음은 하단, 나머지는 ship_ready 내림차순). */
  items: ProductionCapacityAfItem[];
  /** 모델 내 AF 합계. 공유 자재가 있으면 동시 보장은 아님(표시용 합산). */
  totals: {
    ship_ready: number;
    fast_production: number;
    total_production: number;
  };
}

export interface PfCapacityModelGroup {
  key: string;
  label: string;
  variants: ProductionCapacityPfVariant[];
  autoRepresentative: ProductionCapacityPfVariant | null;
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
      const sorted = [...arr].sort((a, b) => {
        const aNeedsAttention = a.bom_status === "incomplete" || !a.has_pf_path;
        const bNeedsAttention = b.bom_status === "incomplete" || !b.has_pf_path;
        if (aNeedsAttention !== bNeedsAttention) return aNeedsAttention ? 1 : -1;
        return b.ship_ready - a.ship_ready;
      });
      const totals = arr.reduce(
        (acc, it) => {
          acc.ship_ready += it.ship_ready;
          acc.fast_production += it.fast_production;
          acc.total_production += it.total_production;
          return acc;
        },
        { ship_ready: 0, fast_production: 0, total_production: 0 },
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

/**
 * 백엔드가 모델별로 자동 선정한 PF 를 반환한다.
 */
export function getAutoRepresentative(
  modelKey: string,
  af: ProductionCapacityAfBlock,
): ProductionCapacityPfVariant | null {
  return (af.auto_representatives ?? []).find(
    (variant) => (variant.model_symbol ?? "").trim() === modelKey,
  ) ?? null;
}

function getModelKey(modelSymbol?: string | null): string {
  return modelSymbol?.trim() || UNCLASSIFIED;
}

function compareModelKeys(a: string, b: string): number {
  if (a === UNCLASSIFIED) return 1;
  if (b === UNCLASSIFIED) return -1;
  return a.localeCompare(b, undefined, { numeric: true });
}

function comparePfVariants(
  a: ProductionCapacityPfVariant,
  b: ProductionCapacityPfVariant,
): number {
  const capacityA = a.ship_ready + a.fast_production + a.total_production;
  const capacityB = b.ship_ready + b.fast_production + b.total_production;
  return (
    capacityB - capacityA ||
    b.total_production - a.total_production ||
    b.fast_production - a.fast_production ||
    b.ship_ready - a.ship_ready ||
    (a.pf_code ?? "").localeCompare(b.pf_code ?? "") ||
    (a.af_item_id ?? "").localeCompare(b.af_item_id ?? "")
  );
}

/**
 * AF 경로별 PF 변형을 모델별로 묶고, 같은 PF는 자동 대표 또는 수량 기준으로 하나만 남긴다.
 */
export function groupPfVariantsByModel(
  af: ProductionCapacityAfBlock,
): PfCapacityModelGroup[] {
  const variantsByModel = new Map<string, ProductionCapacityPfVariant[]>();
  for (const variant of af.pf_variants) {
    const key = getModelKey(variant.model_symbol);
    const variants = variantsByModel.get(key);
    if (variants) variants.push(variant);
    else variantsByModel.set(key, [variant]);
  }

  return Array.from(variantsByModel.entries())
    .map(([key, variants]) => {
      const autoRepresentatives = (af.auto_representatives ?? []).filter(
        (variant) => getModelKey(variant.model_symbol) === key,
      );
      const variantsByPf = new Map<string, ProductionCapacityPfVariant[]>();
      for (const variant of variants) {
        const candidates = variantsByPf.get(variant.pf_item_id);
        if (candidates) candidates.push(variant);
        else variantsByPf.set(variant.pf_item_id, [variant]);
      }
      const deduplicated = Array.from(variantsByPf.values()).map((candidates) => {
        const autoRepresentative = autoRepresentatives.find((representative) =>
          representative.pf_item_id === candidates[0].pf_item_id &&
          candidates.some((variant) => variant.af_item_id === representative.af_item_id),
        );
        return autoRepresentative
          ? candidates.find((variant) => variant.af_item_id === autoRepresentative.af_item_id)!
          : [...candidates].sort(comparePfVariants)[0];
      });
      const sortedVariants = deduplicated.sort((a, b) =>
        (a.pf_code ?? "").localeCompare(b.pf_code ?? "") ||
        a.pf_name.localeCompare(b.pf_name) ||
        a.pf_item_id.localeCompare(b.pf_item_id),
      );
      const autoRepresentative = sortedVariants.find((variant) =>
        autoRepresentatives.some((representative) =>
          representative.pf_item_id === variant.pf_item_id,
        ),
      ) ?? null;
      const label = key === UNCLASSIFIED
        ? UNCLASSIFIED
        : getModelLabel(key, sortedVariants[0]?.pf_name) || `모델${key}`;
      return { key, label, variants: sortedVariants, autoRepresentative };
    })
    .sort((a, b) => compareModelKeys(a.key, b.key));
}

/** 모델 순서에서 자동 대표 PF를 우선하고, 없으면 첫 PF를 반환한다. */
export function getInitialPfVariant(
  groups: PfCapacityModelGroup[],
): ProductionCapacityPfVariant | null {
  return groups.find((group) => group.autoRepresentative)?.autoRepresentative
    ?? groups.find((group) => group.variants.length > 0)?.variants[0]
    ?? null;
}
