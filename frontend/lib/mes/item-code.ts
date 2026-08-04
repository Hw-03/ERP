import type { ProductModel } from "@/lib/api";

/** 제품기호를 품목코드 부여 규칙과 같은 오름차순으로 정렬한다. */
export function sortModelsBySymbol(models: ProductModel[]): ProductModel[] {
  return [...models].sort((left, right) =>
    (left.symbol ?? "").localeCompare(right.symbol ?? ""),
  );
}

/** 선택 슬롯을 품목코드의 제품기호 접두어로 변환한다. */
export function modelSlotsToSymbolPrefix(slots: number[], models: ProductModel[]): string {
  const symbolBySlot = new Map(models.map((model) => [model.slot, model.symbol]));
  return slots
    .map((slot) => symbolBySlot.get(slot))
    .filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0)
    .sort()
    .join("");
}
