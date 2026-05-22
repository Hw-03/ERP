---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_employees_parts/EmployeeEditPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# EmployeeEditPanel.tsx — EmployeeEditPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`EmployeeEditPanel.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `EmployeeEditPanel`
- `FieldRow`
- `Props`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
"use client";

import type { DepartmentMaster, DepartmentRole, Employee, WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";
import type { EmployeeEditForm } from "../../_admin_hooks/useAdminEmployees";

/**
 * 직원 선택 시 우측 패널 — 정보 수정 폼 + PIN 카드 + 비활성/삭제 버튼.
 *
 * Round-10B (#4) 추출. AdminEmployeesSection 우측에서 selectedEmployee 가
 * 있을 때 표시되는 가장 큰 JSX 블록 (~165줄) 을 분리.
 *
 * 시각/className/style 모두 보존. PIN 카드의 default vs 직원 설정 색상
 * 분기, 마지막 변경 일자 포맷도 그대로.
 */

const WAREHOUSE_ROLE_OPTIONS: { value: WarehouseRole; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "primary", label: "정" },
  { value: "deputy", label: "부" },
];

const DEPARTMENT_ROLE_OPTIONS: { value: DepartmentRole; label: string }[] = [
  { value: "none", label: "없음" },
  { value: "primary", label: "정" },
  { value: "deputy", label: "부" },
];

interface Props {
  employee: Employee;
  form: EmployeeEditForm;
  setForm: (updater: (f: EmployeeEditForm) => EmployeeEditForm) => void;
  departments: DepartmentMaster[];
  onSave: () => void;
  onRequestPinReset: (employee: Employee) => void;
  onToggle: (employee: Employee) => void;
  onRequestDelete: (employee: Employee) => void;
}

export function EmployeeEditPanel({
  employee,
  form,
  setForm,
  departments,
  onSave,
  onRequestPinReset,
  onToggle,
  onRequestDelete,
}: Props) {
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xl font-black">{employee.name}</div>
        <div className="mt-1 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
```
