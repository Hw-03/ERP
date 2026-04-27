---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/AdminEmployeesContext.tsx
status: active
updated: 2026-04-27
source_sha: d5e05c4bfe46
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminEmployeesContext.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/AdminEmployeesContext.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `815` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { createContext, useContext } from "react";
import {
  useAdminEmployees,
  type AdminEmployeesState,
  type UseAdminEmployeesArgs,
} from "../_admin_hooks/useAdminEmployees";

const AdminEmployeesContext = createContext<AdminEmployeesState | null>(null);

export function AdminEmployeesProvider({
  children,
  ...args
}: UseAdminEmployeesArgs & { children: React.ReactNode }) {
  const value = useAdminEmployees(args);
  return <AdminEmployeesContext.Provider value={value}>{children}</AdminEmployeesContext.Provider>;
}

export function useAdminEmployeesContext(): AdminEmployeesState {
  const ctx = useContext(AdminEmployeesContext);
  if (!ctx) {
    throw new Error("useAdminEmployeesContext must be used inside <AdminEmployeesProvider>");
  }
  return ctx;
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
