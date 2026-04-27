---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/ioWizardTypes.ts
status: active
updated: 2026-04-27
source_sha: 9088f4a0fad6
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# ioWizardTypes.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/ioWizardTypes.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `1749` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/io|frontend/app/legacy/_components/mobile/io]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

// Shared types for IO wizards. Shape is designed to be 1:1 portable to a
// zustand store: state = fields of IOWizardState, actions = IOWizardAction
// union members. Reducer is a pure function.

export type IOWizardState = {
  step: number;
  mode: string | null;
  employeeId: string | null;
  department: string | null;
  direction: "in" | "out" | null;
  usePackage: boolean;
  packageId: string | null;
  items: Map<string, number>;
  note: string;
  referenceNo: string;
  submitting: boolean;
  error: string | null;
};

export type IOWizardAction =
  | { type: "NEXT" }
  | { type: "PREV" }
  | { type: "GO"; step: number }
  | { type: "SET_MODE"; mode: string | null }
  | { type: "SET_EMPLOYEE"; employeeId: string | null }
  | { type: "SET_DEPARTMENT"; department: string | null }
  | { type: "SET_DIRECTION"; direction: "in" | "out" | null }
  | { type: "SET_USE_PACKAGE"; value: boolean }
  | { type: "SET_PACKAGE"; packageId: string | null }
  | { type: "ADD_ITEM"; itemId: string; qty: number }
  | { type: "SET_QTY"; itemId: string; qty: number }
  | { type: "REMOVE_ITEM"; itemId: string }
  | { type: "CLEAR_ITEMS" }
  | { type: "PREFILL_ITEMS"; itemIds: string[]; qty?: number }
  | { type: "SET_NOTE"; note: string }
  | { type: "SET_REFERENCE"; referenceNo: string }
  | { type: "SET_SUBMITTING"; value: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "RESET" };

export const INITIAL_IO_WIZARD_STATE: IOWizardState = {
  step: 0,
  mode: null,
  employeeId: null,
  department: null,
  direction: null,
  usePackage: false,
  packageId: null,
  items: new Map(),
  note: "",
  referenceNo: "",
  submitting: false,
  error: null,
};
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
