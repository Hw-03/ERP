---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_hooks/useWarehouseData.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useWarehouseData.ts — useWarehouseData.ts 설명

## 이 파일은 무엇을 책임지나

`useWarehouseData.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useWarehouseData`
- `Employee`
- `Item`
- `ProductModel`
- `Args`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useEffect, useState } from "react";
import { api, type Employee, type Item, type ProductModel } from "@/lib/api";

type Args = {
  globalSearch: string;
  onStatusChange: (status: string) => void;
};

export function useWarehouseData({ globalSearch, onStatusChange }: Args) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  // Phase 4: 로딩 플래그 — 메인 데이터(items/employees) 첫 로딩 동안 true.
  // productModels 는 부수 데이터이므로 플래그에 포함하지 않는다.
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .getModels()
      .then((models) => setProductModels(models))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "모델 목록을 불러오지 못했습니다.";
        onStatusChange(msg);
      });
  }, [onStatusChange]);

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api.getEmployees({ activeOnly: true }),
      api.getItems({ limit: 2000, search: globalSearch.trim() || undefined }),
    ])
      .then(([nextEmployees, nextItems]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setLoadFailure(null);
      })
      .catch((nextError) => {
        const msg = nextError instanceof Error ? nextError.message : "입출고 데이터를 불러오지 못했습니다.";
        setLoadFailure(msg);
        onStatusChange(msg);
      })
      .finally(() => setLoading(false));
  }, [globalSearch, onStatusChange]);

  return {
    employees,
    items,
    productModels,
    loadFailure,
    loading,
    setItems,
```
