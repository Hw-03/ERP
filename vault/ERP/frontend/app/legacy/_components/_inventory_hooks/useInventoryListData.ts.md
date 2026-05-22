---
type: file-explanation
source_path: "frontend/app/legacy/_components/_inventory_hooks/useInventoryListData.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useInventoryListData.ts — useInventoryListData.ts 설명

## 이 파일은 무엇을 책임지나

`useInventoryListData.ts`는 대시보드/재고 화면의 목록, 상세, 필터, KPI 표시를 구성하는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useInventoryListData`
- `InventoryDisplayRow`
- `InventoryFilters`
- `InventoryListTotals`
- `UseInventoryListDataResult`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopInventoryView.tsx]] — `DesktopInventoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/query.py]] — `query.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.
- [[ERP/backend/app/services/inventory.py]] — 입고, 출고, 부서 이동, 불량 처리처럼 실제 재고 숫자를 바꾸는 업무 규칙을 담은 핵심 파일입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useDeferredValue, useMemo } from "react";
import type { Item } from "@/lib/api";
import { getStockState } from "@/lib/mes/inventory";
import { useItems } from "../mobile/hooks/useItems";

export interface InventoryFilters {
  department: string;
  kpi: "OK" | "LOW" | "ZERO";
  itemType: "RAW" | "SEMI" | "FIXED";
  modelSlot: null | number;
  grouped: boolean;
}

/**
 * mobile InventoryScreen 의 derivation chain.
 *
 * Round-10B (#3) 추출. search + filters 입력에 대해 useItems → filtered →
 * grouped rows → totals 까지 한 번에 정리. 컴포넌트는 상태(useState) 만
 * 갖고 있으면 되고, 본 hook 의 반환값으로 화면을 그린다.
 *
 * fetch/필터 동작 변화 0 — 기존 useState/useMemo/useDeferredValue 호출
 * 순서 그대로 보존.
 */

const R_SUFFIX = (code: string | null) => code?.endsWith("R") ?? false;
const A_SUFFIX = (code: string | null) => code?.endsWith("A") ?? false;
const F_SUFFIX = (code: string | null) => code?.endsWith("F") ?? false;

export type InventoryDisplayRow = {
  key: string;
  item: Item;
  quantity: number;
  available: number;
  count: number;
};

export interface InventoryListTotals {
  count: number;
  normal: number;
  low: number;
  zero: number;
}

export interface UseInventoryListDataResult {
  items: Item[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
  refetch: () => void;
  rows: InventoryDisplayRow[];
  totals: InventoryListTotals;
}
```
