---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/_employees_parts/EmployeeAddPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# EmployeeAddPanel.tsx — EmployeeAddPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`EmployeeAddPanel.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `EmployeeAddPanel`
- `EmployeeAddForm`
- `TextFieldKey`
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

import { X } from "lucide-react";
import type { DepartmentMaster, DepartmentRole, WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { AppSelect } from "../../common/AppSelect";
import { EMPTY_EMPLOYEE_FORM, type EmployeeAddForm } from "../adminShared";

/**
 * 직원 추가 모드 우측 패널.
 *
 * Round-10B (#4) 추출. AdminEmployeesSection 우측에서 empAddMode === true 일 때
 * 표시되는 폼(직원코드/이름/역할/연락처/부서/창고결재) 영역을 분리.
 *
 * 시각/className/style 모두 그대로. EMPTY_EMPLOYEE_FORM 으로 reset 하는 cancel
 * 동작도 동일.
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

type TextFieldKey = "name" | "role" | "phone";
const TEXT_FIELDS: { key: TextFieldKey; label: string; required: boolean; placeholder: string }[] = [
  { key: "name", label: "이름", required: true, placeholder: "예: 홍길동" },
  { key: "role", label: "역할", required: false, placeholder: "예: 조립/사원" },
  { key: "phone", label: "연락처", required: false, placeholder: "예: 010-0000-0000" },
];

interface Props {
  form: EmployeeAddForm;
  setForm: (updater: (f: EmployeeAddForm) => EmployeeAddForm) => void;
  departments: DepartmentMaster[];
  onClose: () => void;
  onSubmit: () => void;
}

export function EmployeeAddPanel({ form, setForm, departments, onClose, onSubmit }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-base font-bold">직원 추가</div>
        <button
          onClick={() => {
            onClose();
            setForm(() => EMPTY_EMPLOYEE_FORM);
          }}
```
