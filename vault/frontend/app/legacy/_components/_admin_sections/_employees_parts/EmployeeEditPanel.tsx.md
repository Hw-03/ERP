---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_admin_sections/_employees_parts/EmployeeEditPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# EmployeeEditPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_admin_sections/_employees_parts/EmployeeEditPanel.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
