---
type: file-explanation
source_path: "frontend/app/legacy/_components/DesktopWarehouseView.tsx"
importance: critical
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DesktopWarehouseView.tsx — DesktopWarehouseView.tsx 설명

## 이 파일은 무엇을 책임지나

`DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때
- 운영 데이터가 달라질 수 있는 변경을 준비할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DesktopWarehouseView`
- `IoBatch`
- `Item`
- `StockRequest`
- `WarehouseSectionTab`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

이 파일은 운영 데이터, 재고 수량, 승인 상태, DB 구조, 백업/복구 중 하나와 직접 연결됩니다. 수정 전에는 관련 테스트, 백업 여부, 연결 화면/API를 반드시 확인해야 합니다.

## 핵심 발췌

```tsx
"use client";

import { useEffect, useState } from "react";
import { api, type IoBatch, type Item, type StockRequest } from "@/lib/api";
import { canEnterIO, isDepartmentApprover } from "./_warehouse_steps";
import { useWarehouseData } from "./_warehouse_hooks/useWarehouseData";
import { WarehouseHeader } from "./_warehouse_sections/WarehouseHeader";
import { WarehouseSectionTabs, type WarehouseSectionTab } from "./_warehouse_sections/WarehouseSectionTabs";
import { WarehouseAccessDenied } from "./_warehouse_sections/WarehouseAccessDenied";
import { WarehouseDraftPanelTabs } from "./_warehouse_sections/WarehouseDraftPanelTabs";
import { IoComposeView } from "./_warehouse_v2/IoComposeView";
import { readCurrentOperator } from "./login/useCurrentOperator";

// 탭 전환 remount 사이 직전 카운트 보존 (세션 내 메모리 캐시).
// 새로고침 시 휘발 — 첫 진입은 항상 fresh fetch.
const cartCountCache = new Map<string, number>();
const warehouseQueueCountCache = { value: 0 };
const deptQueueCountCache = new Map<string, number>();

export function DesktopWarehouseView({
  globalSearch,
  onStatusChange,
  preselectedItem,
  onSubmitSuccess,
  defectDeptFilter,
}: {
  globalSearch: string;
  onStatusChange: (status: string) => void;
  preselectedItem?: Item | null;
  onSubmitSuccess?: () => void;
  /** Phase 3: 대시보드 빨간 불량 클릭 → URL ?defect_dept=X 로 전달된 부서명.
   *  Phase 4 허브 컴포넌트가 이 값을 읽어 자동 필터 적용. */
  defectDeptFilter?: string | null;
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
  );
  const [deptQueueCount, setDeptQueueCount] = useState(() => {
    const eid = operator?.employee_id ?? "";
    return eid ? deptQueueCountCache.get(eid) ?? 0 : 0;
  });
  const [restoreIoDraft, setRestoreIoDraft] = useState<IoBatch | null>(null);
```
