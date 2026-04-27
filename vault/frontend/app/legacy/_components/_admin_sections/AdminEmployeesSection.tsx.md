---
type: code-note
project: ERP
layer: frontend
source_path: frontend/app/legacy/_components/_admin_sections/AdminEmployeesSection.tsx
status: active
updated: 2026-04-27
source_sha: 5f0359a62be6
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# AdminEmployeesSection.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_admin_sections/AdminEmployeesSection.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `9145` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_admin_sections/_admin_sections|frontend/app/legacy/_components/_admin_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { X } from "lucide-react";
import { DEPARTMENT_LABELS, LEGACY_COLORS, normalizeDepartment } from "../legacyUi";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "./adminShared";
import { useAdminEmployeesContext } from "./AdminEmployeesContext";

// Props 없음. AdminEmployeesProvider 의 Context 에서 모두 읽는다.
export function AdminEmployeesSection() {
  const ctx = useAdminEmployeesContext();
  const {
    employees,
    selectedEmployee,
    setSelectedEmployee,
    empAddMode,
    setEmpAddMode,
    empAddForm,
    setEmpAddForm,
    addEmployee: onAddEmployee,
    toggleEmployee: onToggleEmployee,
  } = ctx;
  return (
    <div className="grid h-full gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div
        className="flex flex-col overflow-hidden rounded-[28px] border"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        <div className="shrink-0 border-b px-4 py-3" style={{ borderColor: LEGACY_COLORS.border }}>
          <div
            className="mb-3 rounded-[12px] border px-3 py-2 flex items-center gap-3 flex-wrap"
            style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
          >
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              전체 <span style={{ color: LEGACY_COLORS.blue, fontWeight: 900 }}>{employees.length}</span>명
            </span>
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              활성 <span style={{ color: LEGACY_COLORS.green, fontWeight: 900 }}>
                {employees.filter((e) => e.is_active).length}
              </span>명
            </span>
            <span className="text-xs font-bold" style={{ color: LEGACY_COLORS.muted2 }}>
              비활성 <span style={{ color: LEGACY_COLORS.red, fontWeight: 900 }}>
                {employees.filter((e) => !e.is_active).length}
              </span>명
            </span>
          </div>
          <button
            onClick={() => {
              setEmpAddMode(true);
              setSelectedEmployee(null);
            }}
            className="w-full rounded-[14px] border border-dashed py-2.5 text-base font-bold"
            style={{ borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.muted2 }}
          >
            + 직원 추가
          </button>
        </div>
        <div className="overflow-y-auto">
          {employees.map((employee, index) => (
            <button
              key={employee.employee_id}
              onClick={() => {
                setSelectedEmployee(employee);
                setEmpAddMode(false);
              }}
              className="flex w-full items-center justify-between px-4 py-4 text-left transition-colors hover:bg-white/[0.12]"
              style={{
                borderBottom: index === employees.length - 1 ? "none" : `1px solid ${LEGACY_COLORS.border}`,
                background:
                  selectedEmployee?.employee_id === employee.employee_id
                    ? `color-mix(in srgb, ${LEGACY_COLORS.purple} 10%, transparent)`
                    : "transparent",
              }}
            >
              <div>
                <div className="text-base font-semibold">{employee.name}</div>
                <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
                  {employee.employee_code} / {normalizeDepartment(employee.department)}
                </div>
              </div>
              <span
                className="inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
                style={{
                  background: employee.is_active
                    ? `color-mix(in srgb, ${LEGACY_COLORS.green} 16%, transparent)`
                    : `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`,
                  color: employee.is_active ? LEGACY_COLORS.green : LEGACY_COLORS.red,
                }}
              >
                {employee.is_active ? "활성" : "비활성"}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div
        className="overflow-y-auto rounded-[28px] border p-5"
        style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
      >
        {empAddMode ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-base font-bold">직원 추가</div>
              <button
                onClick={() => {
                  setEmpAddMode(false);
                  setEmpAddForm(() => EMPTY_EMPLOYEE_FORM);
                }}
                className="flex items-center justify-center rounded-full p-1 hover:bg-red-500/10"
                style={{ color: LEGACY_COLORS.red }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {(
              [
                { key: "employee_code", label: "직원 코드", required: true, placeholder: "예: E27" },
                { key: "name", label: "이름", required: true, placeholder: "예: 홍길동" },
                { key: "role", label: "역할", required: false, placeholder: "예: 조립/사원" },
                { key: "phone", label: "연락처", required: false, placeholder: "예: 010-0000-0000" },
              ] as { key: keyof EmployeeAddForm; label: string; required: boolean; placeholder: string }[]
            ).map(({ key, label, required, placeholder }) => (
              <div key={key}>
                <div
                  className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-[0.18em]"
                  style={{ color: LEGACY_COLORS.muted2 }}
                >
                  {label}
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                    style={{
                      background: required
                        ? `color-mix(in srgb, ${LEGACY_COLORS.red} 14%, transparent)`
                        : `color-mix(in srgb, ${LEGACY_COLORS.muted2} 20%, transparent)`,
                      color: required ? LEGACY_COLORS.red : LEGACY_COLORS.muted2,
                    }}
                  >
                    {required ? "필수" : "선택"}
                  </span>
                </div>
                <input
                  type="text"
                  value={empAddForm[key]}
                  onChange={(e) => setEmpAddForm((f) => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                  style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
                />
              </div>
            ))}
            <div>
              <div className="mb-2 text-sm font-bold uppercase tracking-[0.18em]" style={{ color: LEGACY_COLORS.muted2 }}>
                부서
              </div>
              <select
                value={empAddForm.department}
                onChange={(e) => setEmpAddForm((f) => ({ ...f, department: e.target.value }))}
                className="w-full rounded-[18px] border px-4 py-3 text-base outline-none"
                style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border, color: LEGACY_COLORS.text }}
              >
                {Object.keys(DEPARTMENT_LABELS).map((value) => (
                  <option key={value} value={value}>{DEPARTMENT_LABELS[value]}</option>
                ))}
              </select>
            </div>
            <button
              onClick={onAddEmployee}
              className="w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
              style={{ background: LEGACY_COLORS.blue }}
            >
              추가
            </button>
          </div>
        ) : selectedEmployee ? (
          <>
            <div className="text-xl font-black">{selectedEmployee.name}</div>
            <div className="mt-1 text-base" style={{ color: LEGACY_COLORS.muted2 }}>
              {selectedEmployee.role} / {normalizeDepartment(selectedEmployee.department)}
            </div>
            <button
              onClick={() => onToggleEmployee(selectedEmployee)}
              className="mt-5 w-full rounded-[18px] px-4 py-3 text-base font-bold text-white"
              style={{ background: selectedEmployee.is_active ? LEGACY_COLORS.red : LEGACY_COLORS.green }}
            >
              {selectedEmployee.is_active ? "비활성으로 전환" : "활성으로 전환"}
            </button>
          </>
        ) : (
          <div className="text-base" style={{ color: LEGACY_COLORS.muted2 }}>
            직원을 선택하면 활성 상태를 바꿀 수 있습니다.
          </div>
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
