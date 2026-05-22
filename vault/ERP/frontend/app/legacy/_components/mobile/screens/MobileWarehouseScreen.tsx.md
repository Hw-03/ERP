---
type: file-explanation
source_path: "frontend/app/legacy/_components/mobile/screens/MobileWarehouseScreen.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# MobileWarehouseScreen.tsx — MobileWarehouseScreen.tsx 설명

## 이 파일은 무엇을 책임지나

`MobileWarehouseScreen.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `MobileWarehouseScreen`
- `IoBatch`
- `Item`
- `StockRequest`
- `WarehouseSectionTab`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/mobile/screens/📁_screens]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { canEnterIO, isDepartmentApprover } from "../../_warehouse_steps";
import { useWarehouseData } from "../../_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "../../_warehouse_sections/WarehouseHeader";
import {
  WarehouseSectionTabs,
  type WarehouseSectionTab,
} from "../../_warehouse_sections/WarehouseSectionTabs";
import { WarehouseAccessDenied } from "../../_warehouse_sections/WarehouseAccessDenied";
import { WarehouseDraftPanelTabs } from "../../_warehouse_sections/WarehouseDraftPanelTabs";
import { readCurrentOperator } from "../../login/useCurrentOperator";
import { MobileIoComposeWizard } from "../warehouse/MobileIoComposeWizard";

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시) — DesktopWarehouseView 와 동일.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

/**
 * 입출고 모바일 화면.
 *
 * DesktopWarehouseView 의 데이터/권한/섹션 오케스트레이션을 그대로 따르되,
 * compose 섹션을 모바일 풀스크린 위저드(MobileIoComposeWizard)로 교체해
 * 393px 에서도 품목 선택~제출이 가능하게 한다. queue/cart/부서대기 섹션은
 * 기존 WarehouseDraftPanelTabs 를 재사용한다.
 */
export function MobileWarehouseScreen({
  globalSearch,
  onStatusChange,
  preselectedItem,
  onSubmitSuccess,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
  onSubmitSuccess?: () => void;
}) {
  const { employees, items, productModels, loadFailure, setItems } = useWarehouseData({
    globalSearch,
    onStatusChange,
  });

  const operator = typeof window !== "undefined" ? readCurrentOperator() : null;
  const [employeeId, setEmployeeId] = useState<string>(operator?.employee_id ?? "");
  const [sectionTab, setSectionTab] = useState<WarehouseSectionTab>("compose");
  const [panelRefreshNonce, setPanelRefreshNonce] = useState(0);
  const [cartCount, setCartCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? cartCountCache.get(eid) ?? 0 : 0;
  });
  const [warehouseQueueCount, setWarehouseQueueCount] = useState(
    () => warehouseQueueCountCache.value,
```
