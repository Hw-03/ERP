---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_employees_parts/EmployeeAddPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# EmployeeAddPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_employees_parts/EmployeeAddPanel.tsx]]

## 원본 첫 줄

```
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

```
