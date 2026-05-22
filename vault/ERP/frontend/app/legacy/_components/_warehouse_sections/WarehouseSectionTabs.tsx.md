---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_sections/WarehouseSectionTabs.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# WarehouseSectionTabs.tsx — WarehouseSectionTabs.tsx 설명

## 이 파일은 무엇을 책임지나

`WarehouseSectionTabs.tsx`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `WarehouseSectionTabs`
- `TabButton`
- `WarehouseSectionTab`
- `TabDef`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import { useState } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export type WarehouseSectionTab = "compose" | "cart" | "mine" | "queue" | "dept-queue";

/**
 * DesktopWarehouseView 의 섹션 탭. 권한별로 "창고 승인함" / "부서 승인함" 가시성 분기.
 */

interface Props {
  active: WarehouseSectionTab;
  onChange: (next: WarehouseSectionTab) => void;
  showQueue: boolean;
  showDeptQueue: boolean;
  cartCount?: number;
  queueCount?: number;
  deptQueueCount?: number;
}

type TabDef = { id: WarehouseSectionTab; label: string; tone: string };

export function WarehouseSectionTabs({
  active,
  onChange,
  showQueue,
  showDeptQueue,
  cartCount = 0,
  queueCount = 0,
  deptQueueCount = 0,
}: Props) {
  const tabs: TabDef[] = [
    { id: "compose", label: "요청 작성", tone: LEGACY_COLORS.blue },
    { id: "cart", label: "작업 중", tone: LEGACY_COLORS.green },
    { id: "mine", label: "내 요청", tone: LEGACY_COLORS.purple },
  ];
  if (showQueue) tabs.push({ id: "queue", label: "창고 승인함", tone: LEGACY_COLORS.yellow });
  if (showDeptQueue) tabs.push({ id: "dept-queue", label: "부서 승인함", tone: LEGACY_COLORS.purple });

  const badgeFor = (id: WarehouseSectionTab): number | null => {
    if (id === "cart" && cartCount > 0) return cartCount;
    if (id === "queue" && queueCount > 0) return queueCount;
    if (id === "dept-queue" && deptQueueCount > 0) return deptQueueCount;
    return null;
  };

  return (
    <div
      role="tablist"
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((t) => (
```
