---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/DepartmentsContext.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DepartmentsContext.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/DepartmentsContext.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api, type DepartmentMaster } from "@/lib/api";
import { employeeColor } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";

type Ctx = {
  departments: DepartmentMaster[];
  refresh: () => Promise<void>;
  getColor: (name?: string | null) => string;
};

const DepartmentsCtx = createContext<Ctx | null>(null);

export function DepartmentsProvider({ children }: { children: ReactNode }) {
  const [departments, setDepartments] = useState<DepartmentMaster[]>([]);
  const inflightRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(async () => {
    if (inflightRef.current) return inflightRef.current;
```
