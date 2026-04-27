---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_warehouse_steps/EmployeeStep.tsx
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
              onClick={() => onSelect(emp.employee_id)}
              className="flex flex-col items-center gap-1.5 rounded-[14px] border p-3 transition-all hover:brightness-110"
              style={{
                background: active ? `color-mix(in srgb, ${tone} 14%, transparent)` : LEGACY_COLORS.s2,
                borderColor: active ? tone : LEGACY_COLORS.border,
                borderWidth: active ? 2 : 1,
              }}
            >
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-base font-black text-white"
                style={{ background: tone }}
              >
                {firstEmployeeLetter(emp.name)}
              </span>
              <span className="text-xs font-bold" style={{ color: active ? tone : LEGACY_COLORS.text }}>
                {emp.name}
              </span>
              <span className="text-[10px]" style={{ color: LEGACY_COLORS.muted2 }}>
                {normalizeDepartment(emp.department)}
              </span>
            </button>
          );
        })}
        {overflow && (
          <button
            onClick={() => setExpanded(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-[14px] border-2 border-dashed p-3 text-xs font-bold transition-colors hover:brightness-110"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            <span className="text-2xl leading-none">+</span>
            <span>추가 {employees.length - 10}명</span>
          </button>
        )}
      </div>
    </div>
  );
}
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
