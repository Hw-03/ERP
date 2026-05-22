---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_hooks/useAdminBootstrap.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useAdminBootstrap.ts — useAdminBootstrap.ts 설명

## 이 파일은 무엇을 책임지나

`useAdminBootstrap.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useAdminBootstrap`
- `BOMDetailEntry`
- `DepartmentMaster`
- `Employee`
- `Item`
- `ProductModel`
- `UseAdminBootstrapOptions`
- `UseAdminBootstrapResult`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type BOMDetailEntry,
  type DepartmentMaster,
  type Employee,
  type Item,
  type ProductModel,
} from "@/lib/api";

/**
 * 관리자 화면의 5개 도메인 부트스트랩 + BOM 새로고침 훅.
 *
 * Round-8 (R8-1) 추출. DesktopAdminView 의 6 useState + 2 useEffect (exhaustive-deps
 * disable Cat-C 2건) 를 1 hook 으로 묶고 useCallback 으로 deps 정상화.
 *
 * fetch 타이밍 / API 호출 횟수 변화 0:
 *   - unlocked + globalSearch 변화 시 5 도메인 fetch (Promise.all)
 *   - unlocked 변화 시 BOM 별도 fetch
 */
export interface UseAdminBootstrapOptions {
  unlocked: boolean;
  globalSearch: string;
  onError: (message: string) => void;
}

export interface UseAdminBootstrapResult {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  employees: Employee[];
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  productModels: ProductModel[];
  setProductModels: React.Dispatch<React.SetStateAction<ProductModel[]>>;
  departments: DepartmentMaster[];
  setDepartments: React.Dispatch<React.SetStateAction<DepartmentMaster[]>>;
  allBomRows: BOMDetailEntry[];
  setAllBomRows: React.Dispatch<React.SetStateAction<BOMDetailEntry[]>>;
  loadData: () => Promise<void>;
  refreshAllBom: () => void;
  refreshItems: () => Promise<void>;
}

export function useAdminBootstrap(opts: UseAdminBootstrapOptions): UseAdminBootstrapResult {
  const { unlocked, globalSearch, onError } = opts;

  const [items, setItems] = useState<Item[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [productModels, setProductModels] = useState<ProductModel[]>([]);
  const [allBomRows, setAllBomRows] = useState<BOMDetailEntry[]>([]);
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);

  const loadData = useCallback(async () => {
    const [nextItems, nextEmployees, nextModels, nextDepts] = await Promise.all([
```
