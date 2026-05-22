---
type: file-explanation
source_path: "frontend/lib/api/employees.ts"
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

- `employeesApi`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/frontend/lib/api/types/employees.ts]] — `employees.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Employees 도메인 API — `@/lib/api/employees`.
 *
 * Round-6 (R6-D2) 분리. 6 메소드:
 *   - getEmployees / createEmployee / updateEmployee / deleteEmployee
 *   - verifyEmployeePin / resetEmployeePin
 *
 * 외부 호환을 위해 `frontend/lib/api.ts` 가 spread merge.
 */

import { deleteJson, fetcher, postJson, putJson, toApiUrl } from "../api-core";
import type { Department, DepartmentRole, Employee, EmployeeLevel, WarehouseRole } from "./types";

export const employeesApi = {
  getEmployees: (params?: { department?: Department; activeOnly?: boolean }) => {
    const query = new URLSearchParams();
    if (params?.department) query.set("department", params.department);
    if (params?.activeOnly !== undefined) query.set("active_only", String(params.activeOnly));
    return fetcher<Employee[]>(toApiUrl(`/api/employees?${query}`));
  },

  createEmployee: (payload: {
    employee_code?: string;
    name: string;
    role: string;
    phone?: string;
    department: Department;
    level?: EmployeeLevel;
    warehouse_role?: WarehouseRole;
    department_role?: DepartmentRole;
    display_order?: number;
    is_active?: boolean;
    /** 조립 부서 직원의 담당 모델 slot 목록 (배열 순서 = 우선순위). */
    assigned_model_slots?: number[];
  }) => postJson<Employee>(toApiUrl("/api/employees"), payload),

  updateEmployee: (
    employeeId: string,
    payload: {
      name?: string;
      role?: string;
      phone?: string;
      department?: Department;
      level?: EmployeeLevel;
      warehouse_role?: WarehouseRole;
      department_role?: DepartmentRole;
      display_order?: number;
      is_active?: boolean;
      /** 담당 모델 slot 목록. null=변경 없음, []=전부 제거. */
      assigned_model_slots?: number[];
    },
  ) => putJson<Employee>(toApiUrl(`/api/employees/${employeeId}`), payload),

  deleteEmployee: (employeeId: string) =>
    deleteJson<{ result: "deleted" | "deactivated" }>(toApiUrl(`/api/employees/${employeeId}`)),
```
