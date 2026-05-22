---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/screens/MobileDashboardScreen.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileDashboardScreen.tsx — MobileDashboardScreen.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileDashboardScreen.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileDashboardScreen`
- `Item`
- `ProductModel`
- `ProductionCapacity`
- `TransactionLog`
- `KpiFilter`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/screens/📁_screens]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { api, type Item, type ProductModel, type ProductionCapacity, type TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { itemCodeDept } from "@/lib/mes/process";
import { SlidersHorizontal } from "lucide-react";
import { BottomSheet } from "@/lib/ui/BottomSheet";
import { InlineSearch } from "../primitives";
import { InventoryKpiPanel, type KpiFilter } from "../../_inventory_sections/InventoryKpiPanel";
import { InventoryCapacityPanel } from "../../_inventory_sections/InventoryCapacityPanel";
import { InventoryFilters } from "../../_inventory_sections/InventoryFilterBar";
import { InventoryItemsTable } from "../../_inventory_sections/InventoryItemsTable";
import { InventoryDetailPanel } from "../../_inventory_sections/InventoryDetailPanel";
import { useInventoryData } from "../../_hooks/useInventoryData";
import { useDesktopInventoryDerivations } from "../../_hooks/useDesktopInventoryDerivations";
import { useItemImageManifest } from "../../_hooks/useItemImageManifest";
import { matchesKpi, matchesSearch } from "../../_inventory_sections/inventoryFilter";

const PAGE_SIZE = 100;

/**
 * 대시보드 모바일 화면.
 *
 * DesktopInventoryView 의 데이터 오케스트레이션(훅/필터/파생)을 그대로 재사용하되,
 * 데스크탑의 우측 SlidePanel 상세를 모바일 친화적인 드래그-투-디스미스 BottomSheet
 * 로 교체한다. 상단 KPI/생산가능/필터/리스트는 이미 반응형인 기존 섹션을 재사용.
 */
export function MobileDashboardScreen({
  globalSearch,
  onStatusChange,
  onGoToWarehouse,
  capacityData,
  onCapacityClick,
  onSummaryChange,
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
  const onSelectedSync = useCallback(
    (next: Item[]) =>
      setSelectedItem((current) =>
        current ? next.find((item) => item.item_id === current.item_id) ?? null : null,
      ),
    [],
  );
  const { items, loading, error, loadItems } = useInventoryData({
    globalSearch,
```
