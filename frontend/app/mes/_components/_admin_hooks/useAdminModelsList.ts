"use client";

// W5: Models 도메인 List sub-hook.
// 책임: 등록 모델 목록 자체 (현재 도메인은 검색·필터가 없으므로 visibleItems = items pass-through).

import { useMemo } from "react";
import type { ProductModel } from "@/lib/api";

export type UseAdminModelsListArgs = {
  productModels: ProductModel[];
};

export type UseAdminModelsListState = {
  items: ProductModel[];
  visibleItems: ProductModel[];
};

export function useAdminModelsList({
  productModels,
}: UseAdminModelsListArgs): UseAdminModelsListState {
  // 모델은 현재 필터링 UI가 없음 — visibleItems = items.
  // 추후 필터(사용 중/비활성) 추가 시 여기서 처리.
  const visibleItems = useMemo(() => productModels, [productModels]);
  return {
    items: productModels,
    visibleItems,
  };
}
