---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/AdminBomContext.tsx
status: active
updated: 2026-04-27
source_sha: 150584264aa6
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminBomContext.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/AdminBomContext.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `943` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

// AdminBomSection 의 Props drilling 을 끊는 React Context.
// DesktopAdminView 가 <AdminBomProvider items={...} ...> 로 감싸고,
// 섹션 내부 어디에서나 useAdminBomContext() 로 동일한 상태에 접근한다.

import { createContext, useContext } from "react";
import { useAdminBom, type AdminBomState, type UseAdminBomArgs } from "../_admin_hooks/useAdminBom";

const AdminBomContext = createContext<AdminBomState | null>(null);

export function AdminBomProvider({
  children,
  ...args
}: UseAdminBomArgs & { children: React.ReactNode }) {
  const value = useAdminBom(args);
  return <AdminBomContext.Provider value={value}>{children}</AdminBomContext.Provider>;
}

export function useAdminBomContext(): AdminBomState {
  const ctx = useContext(AdminBomContext);
  if (!ctx) {
    throw new Error("useAdminBomContext must be used inside <AdminBomProvider>");
  }
  return ctx;
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
