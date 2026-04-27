---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_hooks/useWarehouseData.ts
status: active
updated: 2026-04-27
source_sha: 8ffd50e39766
tags:
  - erp
  - frontend
  - frontend-hook
  - ts
---

# useWarehouseData.ts

> [!summary] 역할
> 프론트엔드 화면에서 상태, 데이터 로딩, 상호작용 흐름을 재사용하기 위한 React hook이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_hooks/useWarehouseData.ts`
- Layer: `frontend`
- Kind: `frontend-hook`
- Size: `2200` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_hooks/_warehouse_hooks|frontend/app/legacy/_components/_warehouse_hooks]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import { useEffect, useState } from "react";
import { api, type Employee, type Item, type ProductModel, type ShipPackage } from "@/lib/api";

type Args = {
  globalSearch: string;
  onStatusChange: (status: string) => void;
};

export function useWarehouseData({ globalSearch, onStatusChange }: Args) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [packages, setPackages] = useState<ShipPackage[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  // Phase 4: 로딩 플래그 — 메인 데이터(items/employees/packages) 첫 로딩 동안 true.
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
      api.getShipPackages(),
    ])
      .then(([nextEmployees, nextItems, nextPackages]) => {
        setEmployees(nextEmployees);
        setItems(nextItems);
        setPackages(nextPackages);
        setLoadFailure(null);
        onStatusChange(`입출고 준비 완료: 직원 ${nextEmployees.length}명, 품목 ${nextItems.length}건`);
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
    packages,
    productModels,
    loadFailure,
    loading,
    setItems,
  };
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
