---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/ioWizardReducer.ts
status: active
updated: 2026-04-27
source_sha: 9b81cd411858
tags:
  - erp
  - frontend
  - frontend-module
  - ts
---

# ioWizardReducer.ts

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/ioWizardReducer.ts`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `3451` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/io|frontend/app/legacy/_components/mobile/io]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````ts
"use client";

import {
  INITIAL_IO_WIZARD_STATE,
  type IOWizardAction,
  type IOWizardState,
} from "./ioWizardTypes";

// Pure reducer — no side effects. Steps that change UI flow (e.g. mode,
// direction) often also reset dependent fields; we handle those transitions
// here so components don't need to replicate the logic.

export function ioWizardReducer(state: IOWizardState, action: IOWizardAction): IOWizardState {
  switch (action.type) {
    case "NEXT":
      return { ...state, step: state.step + 1, error: null };
    case "PREV":
      return { ...state, step: Math.max(0, state.step - 1), error: null };
    case "GO":
      return { ...state, step: Math.max(0, action.step), error: null };

    case "SET_MODE":
      // Changing mode invalidates item/package selection to avoid stale state.
      return {
        ...state,
        mode: action.mode,
        items: new Map(),
        packageId: null,
        usePackage: false,
        error: null,
      };

    case "SET_EMPLOYEE":
      return { ...state, employeeId: action.employeeId, error: null };

    case "SET_DEPARTMENT":
      // Changing department clears employee (employees are dept-filtered)
      // and item selections.
      return {
        ...state,
        department: action.department,
        employeeId: null,
        items: new Map(),
        packageId: null,
        error: null,
      };

    case "SET_DIRECTION":
      return {
        ...state,
        direction: action.direction,
        // Packages are ship-only, so switching to "in" disables them.
        usePackage: action.direction === "in" ? false : state.usePackage,
        packageId: action.direction === "in" ? null : state.packageId,
        error: null,
      };

    case "SET_USE_PACKAGE":
      return {
        ...state,
        usePackage: action.value,
        items: action.value ? new Map() : state.items,
        packageId: action.value ? state.packageId : null,
        error: null,
      };

    case "SET_PACKAGE":
      return { ...state, packageId: action.packageId, error: null };

    case "ADD_ITEM": {
      const next = new Map(state.items);
      next.set(action.itemId, action.qty);
      return { ...state, items: next, error: null };
    }

    case "SET_QTY": {
      const next = new Map(state.items);
      if (action.qty <= 0) next.delete(action.itemId);
      else next.set(action.itemId, action.qty);
      return { ...state, items: next, error: null };
    }

    case "REMOVE_ITEM": {
      const next = new Map(state.items);
      next.delete(action.itemId);
      return { ...state, items: next, error: null };
    }

    case "CLEAR_ITEMS":
      return { ...state, items: new Map(), error: null };

    case "PREFILL_ITEMS": {
      const next = new Map<string, number>();
      action.itemIds.forEach((id) => next.set(id, action.qty ?? 1));
      return { ...state, items: next, error: null };
    }

    case "SET_NOTE":
      return { ...state, note: action.note };

    case "SET_REFERENCE":
      return { ...state, referenceNo: action.referenceNo };

    case "SET_SUBMITTING":
      return { ...state, submitting: action.value };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "RESET":
      return { ...INITIAL_IO_WIZARD_STATE, items: new Map() };

    default:
      return state;
  }
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
