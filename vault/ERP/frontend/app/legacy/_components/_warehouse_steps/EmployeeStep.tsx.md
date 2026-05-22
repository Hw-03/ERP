---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_warehouse_steps/EmployeeStep.tsx
status: active
updated: 2026-04-27
source_sha: d9faeee413fe
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# EmployeeStep.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_warehouse_steps/EmployeeStep.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `2512` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_warehouse_steps/_warehouse_steps|frontend/app/legacy/_components/_warehouse_steps]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import type { Employee } from "@/lib/api";
import {
  LEGACY_COLORS,
  employeeColor,
  firstEmployeeLetter,
  normalizeDepartment,
} from "../legacyUi";

export function EmployeeStep({
  employees,
  selectedId,
  onSelect,
  expanded,
  setExpanded,
}: {
  employees: Employee[];
  selectedId: string;
  onSelect: (id: string) => void;
  expanded: boolean;
  setExpanded: (e: boolean) => void;
}) {
  const visible = expanded ? employees : employees.slice(0, 10);
  const overflow = !expanded && employees.length > 10;

  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {visible.map((emp) => {
          const active = emp.employee_id === selectedId;
          const tone = employeeColor(emp.department);
          return (
            <button
              key={emp.employee_id}
# ... (이하 37줄 생략. 원본 참조)

````
