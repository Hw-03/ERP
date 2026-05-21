---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/AdminDepartmentsContext.tsx
tags: [vault, code-note, auto-generated, stub]
---

# AdminDepartmentsContext.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/AdminDepartmentsContext.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { createContext, useContext } from "react";
import {
  useAdminDepartments,
  type AdminDepartmentsState,
  type UseAdminDepartmentsArgs,
} from "../_admin_hooks/useAdminDepartments";

const AdminDepartmentsContext = createContext<AdminDepartmentsState | null>(null);

export function AdminDepartmentsProvider({
  children,
  ...args
}: UseAdminDepartmentsArgs & { children: React.ReactNode }) {
  const value = useAdminDepartments(args);
  return <AdminDepartmentsContext.Provider value={value}>{children}</AdminDepartmentsContext.Provider>;
}

export function useAdminDepartmentsContext(): AdminDepartmentsState {
  const ctx = useContext(AdminDepartmentsContext);
  if (!ctx) throw new Error("useAdminDepartmentsContext must be used inside <AdminDepartmentsProvider>");
  return ctx;
}
```
