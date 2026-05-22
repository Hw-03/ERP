---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_hooks/useAdminMasterItems.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useAdminMasterItems.ts — useAdminMasterItems.ts 설명

## 이 파일은 무엇을 책임지나

`useAdminMasterItems.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `useAdminMasterItems`
- `AddForm`
- `UseAdminMasterItemsArgs`
- `UpdateItemPayload`
- `AdminMasterItemsState`

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

// AdminMasterItemsSection 전용 hook.
// 품목 마스터 검색/선택/추가/필드 저장 상태와 액션을 한 곳에 모은다.

import { useMemo, useState } from "react";
import type { Item } from "@/lib/api";
import { api } from "@/lib/api";
import { EMPTY_ADD_FORM, type AddForm } from "../_admin_sections/adminShared";

export type UseAdminMasterItemsArgs = {
  items: Item[];
  setItems: (updater: (prev: Item[]) => Item[]) => void;
  globalSearch: string;
  onStatusChange: (msg: string) => void;
  onError: (msg: string) => void;
  /** 짧은 토스트(상단 우측 비공식 메시지) — DesktopAdminView 의 showSave 와 호환 */
  onShowSave?: (msg: string) => void;
};

type UpdateItemPayload = {
  item_name?: string;
  spec?: string;
  legacy_item_type?: string;
  supplier?: string;
  min_stock?: number;
  process_type_code?: string;
  unit?: string;
  model_slots?: number[];
  option_code?: string;
  item_code?: string;
};

export type AdminMasterItemsState = {
  selectedItem: Item | null;
  setSelectedItem: (i: Item | null) => void;
  itemSearch: string;
  setItemSearch: (v: string) => void;
  addMode: boolean;
  setAddMode: (v: boolean) => void;
  addForm: AddForm;
  setAddForm: (updater: (f: AddForm) => AddForm) => void;
  visibleItems: Item[];
  addItem: () => void;
  saveItemField: (
    field: "item_name" | "spec" | "barcode" | "supplier" | "min_stock" | "unit" | "item_code" | "process_type_code",
    value: string,
  ) => void;
  updateItemFull: (payload: UpdateItemPayload) => void;
};

export function useAdminMasterItems({
  items,
  setItems,
  globalSearch,
```
