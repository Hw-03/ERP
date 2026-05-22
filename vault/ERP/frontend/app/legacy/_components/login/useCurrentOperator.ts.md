---
type: file-explanation
source_path: "frontend/app/legacy/_components/login/useCurrentOperator.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# useCurrentOperator.ts — useCurrentOperator.ts 설명

## 이 파일은 무엇을 책임지나

`useCurrentOperator.ts`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `readCurrentOperator`
- `getStoredBootId`
- `setCurrentOperator`
- `clearCurrentOperator`
- `useCurrentOperator`
- `operatorProducedBy`
- `Operator`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/page.tsx]] — `page.tsx`는 TypeScript/React 코드입니다. 프로젝트 구조 안에서 `frontend/app/legacy/page.tsx` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/services/pin_auth.py]] — `pin_auth.py`는 `pin_auth` 업무 규칙을 실제로 실행하는 Python 코드입니다. 라우터보다 안쪽에서 DB 조회와 변경을 담당합니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
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
const OPERATOR_CHANGE_EVENT = "dexcowin_operator_change";

function readOperator(): Operator | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(OPERATOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Operator> & {
      warehouse_role?: string | null;
      department_role?: string | null;
      assigned_model_slots?: unknown;
    };
    if (!parsed.employee_id || !parsed.name) return null;
    const wh = (parsed.warehouse_role ?? "none").toLowerCase();
    const dept = (parsed.department_role ?? "none").toLowerCase();
    const slotsRaw = parsed.assigned_model_slots;
    const slots = Array.isArray(slotsRaw)
      ? slotsRaw.filter((s): s is number => typeof s === "number" && Number.isInteger(s))
      : [];
    return {
      employee_id: parsed.employee_id,
      name: parsed.name,
      department: parsed.department as Department,
      level: parsed.level as EmployeeLevel,
      employee_code: parsed.employee_code as string,
```
