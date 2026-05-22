---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/AdminEmployeesSection.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# AdminEmployeesSection.tsx — AdminEmployeesSection.tsx 설명

## 이 파일은 무엇을 책임지나

`AdminEmployeesSection.tsx`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AdminEmployeesSection`
- `EmployeeAddInline`
- `EmployeeDetailGrid`
- `DetailCardSlot`
- `FieldRow`
- `TextInput`
- `SelectInput`
- `DepartmentMaster`
- `DepartmentRole`
- `Employee`
- 그 외 5개 항목

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

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2, Users, X } from "lucide-react";
import { api, type DepartmentMaster, type DepartmentRole, type Employee, type EmployeeLevel, type ProductModel, type WarehouseRole } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment, getDepartmentFallbackColor } from "@/lib/mes/department";
import { ConfirmModal } from "@/lib/ui/ConfirmModal";
import { EmptyState } from "../common";
import { AppSelect } from "../common/AppSelect";
import { StatusPill } from "../common/StatusPill";
import {
  AdminDetailCard,
  AdminKpiBar,
  AdminListPanel,
  AdminPageHeader,
} from "./_admin_primitives";
import { useAdminEmployeesContext } from "./AdminEmployeesContext";
import { AssignedModelsEditor } from "./AssignedModelsEditor";

const ASSEMBLY_DEPT = "조립";

const WAREHOUSE_ROLE_LABEL: Record<WarehouseRole, { label: string; hint: string; tone: string }> = {
  none: { label: "없음", hint: "기본 작업만 수행", tone: LEGACY_COLORS.muted2 },
  primary: { label: "정", hint: "창고 주담당 결재", tone: LEGACY_COLORS.blue },
  deputy: { label: "부", hint: "보조 결재 가능", tone: LEGACY_COLORS.cyan },
};

const DEPARTMENT_ROLE_LABEL: Record<DepartmentRole, { label: string; hint: string; tone: string }> = {
  none: { label: "없음", hint: "기본 작업만 수행", tone: LEGACY_COLORS.muted2 },
  primary: { label: "정", hint: "부서 주담당 결재", tone: LEGACY_COLORS.green },
  deputy: { label: "부", hint: "보조 결재 가능", tone: LEGACY_COLORS.purple },
};

const LEVEL_LABEL: Record<string, { label: string; hint: string; tone: string }> = {
  admin: { label: "관리자", hint: "전체 시스템 관리 권한", tone: LEGACY_COLORS.red },
  manager: { label: "매니저", hint: "부서 운영·데이터 수정", tone: LEGACY_COLORS.purple },
  staff: { label: "사원", hint: "기본 작업 권한", tone: LEGACY_COLORS.muted2 },
};

export function AdminEmployeesSection() {
  const ctx = useAdminEmployeesContext();
  const {
    employees,
    departments,
    selectedEmployee,
    setSelectedEmployee,
    empAddMode,
    setEmpAddMode,
    empAddForm,
    setEmpAddForm,
    addEmployee,
    toggleEmployee,
    confirmTarget,
    confirmToggle,
```
