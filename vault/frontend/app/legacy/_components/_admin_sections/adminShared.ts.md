---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/adminShared.ts
status: active
updated: 2026-04-27
source_sha: ed27716a608f
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# adminShared.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/adminShared.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `1649` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
import type { Item } from "@/lib/api";

export const CATEGORY_OPTIONS = [
  { value: "RM", label: "RM — 원자재" },
  { value: "TA", label: "TA — 튜브 조립" },
  { value: "HA", label: "HA — 고압 조립" },
  { value: "VA", label: "VA — 진공 조립" },
  { value: "AA", label: "AA — 최종 조립" },
  { value: "FG", label: "FG — 완제품" },
  { value: "UK", label: "UK — 미분류" },
];

export const MODEL_SLOTS = [
  { slot: 1, label: "DX3000",   symbol: "3" },
  { slot: 2, label: "COCOON",   symbol: "7" },
  { slot: 3, label: "SOLO",     symbol: "8" },
  { slot: 4, label: "ADX4000W", symbol: "4" },
  { slot: 5, label: "ADX6000",  symbol: "6" },
];

export const UNIT_OPTIONS = ["EA", "SET", "kg", "g", "m", "mm", "L", "box"];

export const PKG_CATEGORY_OPTIONS = [
  { value: "ALL", label: "전체" },
  { value: "RM",  label: "RM"  },
  { value: "?A",  label: "?A"  },
  { value: "?F",  label: "?F"  },
  { value: "FG",  label: "FG"  },
];

export const EMPTY_ADD_FORM = {
  item_name: "",
  category: "RM" as Item["category"],
  spec: "",
  unit: "EA",
  model_slots: [] as number[],
  option_code: "",
  legacy_item_type: "",
  supplier: "",
  min_stock: "",
  initial_quantity: "",
};

export type AddForm = typeof EMPTY_ADD_FORM;

export const EMPTY_EMPLOYEE_FORM = {
  employee_code: "",
  name: "",
  role: "",
  phone: "",
  department: "조립",
};

export type EmployeeAddForm = typeof EMPTY_EMPLOYEE_FORM;

export const BOM_PARENT_CATS = ["ALL", "AA", "HA", "VA", "TA", "AF", "TF", "FG"];
export const BOM_CHILD_CATS = ["ALL", "RM", "?A", "?F"];
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
