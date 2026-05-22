---
type: file-explanation
source_path: "frontend/app/legacy/_components/DepartmentsContext.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# DepartmentsContext.tsx — DepartmentsContext.tsx 설명

## 이 파일은 무엇을 책임지나

`DepartmentsContext.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `DepartmentsProvider`
- `useDepartments`
- `useRefreshDepartments`
- `useDeptColor`
- `useDeptColorLookup`
- `ReactNode`
- `DepartmentMaster`
- `Ctx`

## 연결되는 파일

- [[ERP/frontend/app/legacy/_components/📁__components]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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
    const p = api
      .getDepartments({ isActive: true })
      .then((rows) => {
        setDepartments(rows);
      })
      .catch(() => {})
      .finally(() => {
        inflightRef.current = null;
      });
    inflightRef.current = p;
    return p;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // departments 가 바뀔 때만 lookup 함수가 새로 만들어지도록.
  const getColor = useMemo(() => {
    const byName = new Map<string, string>();
    for (const d of departments) {
      if (d.color_hex) byName.set(d.name, d.color_hex);
    }
    return (name?: string | null) => {
      if (!name) return employeeColor(name);
```
