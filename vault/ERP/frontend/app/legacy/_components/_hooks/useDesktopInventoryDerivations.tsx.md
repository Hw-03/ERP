---
type: file-explanation
source_path: "frontend/app/legacy/_components/_hooks/useDesktopInventoryDerivations.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useDesktopInventoryDerivations.tsx — useDesktopInventoryDerivations.tsx 설명

## 이 파일은 무엇을 책임지나

`useDesktopInventoryDerivations.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useDesktopInventoryDerivations`
- `UseDesktopInventoryDerivationsResult`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/_hooks/📁__hooks]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useMemo } from "react";
import type { ReactNode } from "react";
import type { Item } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getStockState } from "@/lib/mes/inventory";
import type { KpiCardData as KpiCard } from "../_inventory_sections/InventoryKpiPanel";
import { getMinStock, safeQty } from "../_inventory_sections/inventoryFilter";

/**
 * Round-13 (#20) 추출 — DesktopInventoryView 의 summary/kpiCards/badge derivation hook.
 */
export interface UseDesktopInventoryDerivationsResult {
  isFiltered: boolean;
  activeFilterCount: number;
  kpiCards: KpiCard[];
  headerBadge: ReactNode;
}

export function useDesktopInventoryDerivations({
  items,
  scopedItems,
  filteredItems,
  selectedDepts,
  selectedModels,
  selectedProcessSteps,
  deferredLocalSearch,
  displayItem,
  onSummaryChange,
}: {
  items: Item[];
  scopedItems: Item[];
  filteredItems: Item[];
  selectedDepts: string[];
  selectedModels: string[];
  selectedProcessSteps: string[];
  deferredLocalSearch: string;
  displayItem: Item | null;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
}): UseDesktopInventoryDerivationsResult {
  const summary = useMemo(() => {
    const totalQuantity = scopedItems.reduce((acc, item) => acc + safeQty(item), 0);
    const normalCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) >= getMinStock(item)).length;
    const lowCount = scopedItems.filter((item) => safeQty(item) > 0 && safeQty(item) < getMinStock(item)).length;
    const zeroCount = scopedItems.filter((item) => safeQty(item) <= 0).length;
    return { totalCount: scopedItems.length, totalQuantity, normalCount, lowCount, zeroCount };
  }, [scopedItems]);

  useEffect(() => {
    onSummaryChange?.({ low: summary.lowCount, zero: summary.zeroCount });
  }, [summary.lowCount, summary.zeroCount, onSummaryChange]);

  const isFiltered =
    selectedDepts.length > 0 ||
```
