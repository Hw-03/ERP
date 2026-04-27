---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/mobile/io/dept/context.tsx
status: active
updated: 2026-04-27
source_sha: 93c6a7788727
tags:
  - erp
  - frontend
  - frontend-module
  - tsx
---

# context.tsx

> [!summary] 역할
> 프론트엔드 화면을 구성하는 타입, 상수, 유틸리티, 보조 모듈이다.

## 원본 위치

- Source: `frontend/app/legacy/_components/mobile/io/dept/context.tsx`
- Layer: `frontend`
- Kind: `frontend-module`
- Size: `914` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/mobile/io/dept/dept|frontend/app/legacy/_components/mobile/io/dept]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { createContext, useContext, useMemo, useReducer } from "react";
import { INITIAL_IO_WIZARD_STATE, type IOWizardAction, type IOWizardState } from "../ioWizardTypes";
import { ioWizardReducer } from "../ioWizardReducer";

type Ctx = {
  state: IOWizardState;
  dispatch: React.Dispatch<IOWizardAction>;
};

const DeptWizardContext = createContext<Ctx | null>(null);

export function DeptWizardProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(ioWizardReducer, INITIAL_IO_WIZARD_STATE);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <DeptWizardContext.Provider value={value}>{children}</DeptWizardContext.Provider>;
}

export function useDeptWizard() {
  const ctx = useContext(DeptWizardContext);
  if (!ctx) throw new Error("useDeptWizard must be used within DeptWizardProvider");
  return ctx;
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
