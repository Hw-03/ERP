---
type: file-explanation
source_path: "frontend/lib/api/types/employees.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# employees.ts — employees.ts 설명

## 이 파일은 무엇을 책임지나

`employees.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `Employee`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Employees 도메인 타입 — `@/lib/api/types/employees`.
 * Round-10A (#2) 본문 이전.
 */

import type { Department, DepartmentRole, EmployeeLevel, WarehouseRole } from "./shared";

export interface Employee {
  employee_id: string;
  employee_code: string;
  name: string;
  role: string;
  phone: string | null;
  department: Department;
  level: EmployeeLevel;
  /** 창고 결재 역할 — 기본 "none". primary/deputy 만 창고 흐름 승인/반려 가능. */
  warehouse_role: WarehouseRole;
  /** 부서 결재 역할 — 낱개(manual/adjust) 입출고 작업 승인 권한. warehouse_role 와 별개. */
  department_role: DepartmentRole;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  pin_last_changed?: string | null;
  /** true면 기본 PIN(0000) 또는 미설정. false면 직원이 직접 설정한 PIN. */
  pin_is_default?: boolean;
  /** 개인별 테마 설정 (light | dark | null). */
  theme?: string | null;
  /** 조립 부서 직원의 담당 모델 slot 목록. 배열 순서 = 우선순위 (앞=상위). */
  assigned_model_slots?: number[];
}
```
