---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/login/useCurrentOperator.ts
tags: [vault, code-note, auto-generated, stub]
---

# useCurrentOperator.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/login/useCurrentOperator.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
/**
 * 현재 로그인된 작업자 정보를 localStorage에서 관리하는 훅.
 *
 * 작업자 식별용 — 실제 보안 인증이 아님.
 * 로그인된 작업자 정보는 입출고/수정 작업의 produced_by 기본값으로 사용된다.
 */

import { useEffect, useState } from "react";
import type { Department, DepartmentRole, EmployeeLevel, WarehouseRole } from "@/lib/api";

export interface Operator {
  employee_id: string;
  name: string;
  department: Department;
  level: EmployeeLevel;
  employee_code: string;
  /** 창고 결재 역할 — 기존 데이터 호환을 위해 누락 시 "none" 폴백. */
  warehouse_role: WarehouseRole;
  /** 부서 결재 역할 — 낱개(manual/adjust) IO 결재 권한. 누락 시 "none". */
  department_role: DepartmentRole;
  /** 개인별 테마 설정 (light | dark | null). 누락 시 null. */
  theme?: string | null;
  /** 조립 부서 직원의 담당 모델 slot 목록 (priority 순서). 누락 시 []. */
  assigned_model_slots: number[];
}

const OPERATOR_KEY = "dexcowin_mes_operator";
const BOOT_KEY = "dexcowin_mes_boot_id";
// 같은 탭에서 setCurrentOperator 가 호출되면 useCurrentOperator 구독자들을 깨우기 위한 이벤트.
// localStorage `storage` 이벤트는 다른 탭에만 발화하므로 별도 CustomEvent 필요.
```
