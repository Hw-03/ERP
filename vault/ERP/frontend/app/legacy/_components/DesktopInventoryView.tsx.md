---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopInventoryView.tsx"
importance: critical
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopInventoryView.tsx — DesktopInventoryView.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopInventoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopInventoryView`
- `Item`
- `ProductModel`
- `ProductionCapacity`
- `TransactionLog`
- `KpiFilter`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```tsx
"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { itemCodeDept } from "@/lib/mes/process";
import { InventoryKpiPanel, type KpiFilter } from "./_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel } from "./_inventory_sections/InventoryCapacityPanel";
import { InventoryFilterToggleButton } from "./_inventory_sections/InventoryFilterToggleButton";
import {
  InventoryFilters,
  InventoryTableStickyHeader,
} from "./_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "./_inventory_sections/InventoryItemsTable";
import { DesktopInventoryRightPanel } from "./_inventory_sections/DesktopInventoryRightPanel";
import { useInventoryData } from "./_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "./_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "./_hooks/useItemImageManifest";
// R9-2: helper 4개 (getMinStock / safeQty / matchesSearch / matchesKpi) 분리
import { matchesKpi, matchesSearch } from "./_inventory_sections/inventoryFilter";

const DESKTOP_PAGE_SIZE = 100;


export function DesktopInventoryView({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  onGoToWarehouseTab,
  onSummaryChange,
  capacityData,
  onCapacityClick,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  onGoToWarehouse: (item: Item) => void;
  onGoToWarehouseTab?: () => void;
  onSummaryChange?: (s: { low: number; zero: number }) => void;
  capacityData?: ProductionCapacity | null;
  onCapacityClick?: () => void;
}) {
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [itemLogs, setItemLogs] = useState<TransactionLog[]>([]);
  // R7-HOOK2: items/loading/error + loadItems 훅으로 분리
  const onSelectedSync = useCallback(
    (next: Item[]) =>
      setSelectedItem((current) =>
        current ? next.find((item) => item.item_id === current.item_id) ?? null : null,
      ),
    [],
  );
  const { items, setItems, loading, error, loadItems } = useInventoryData({
    globalSearch,
    onStatusChange,
    onSelectedSync,
```
