---
type: file-explanation
source_path: "frontend/app/legacy/_components/_warehouse_steps/_constants.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# _constants.ts — _constants.ts 설명

## 이 파일은 무엇을 책임지나

`_constants.ts`는 입출고 요청 작성, 작업중 목록, 내 요청, 창고 승인함 같은 창고 업무 화면의 일부입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `getDeptOptionsForOperator`
- `matchesSearch`
- `workTypeNeedsDept`
- `isWarehouseStaff`
- `isDepartmentApprover`
- `canEnterIO`
- `workTypesForOperator`
- `PAGE_SIZE`
- `PROD_DEPTS`
- `WORK_TYPES`
- 그 외 8개 항목

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopWarehouseView.tsx]] — `DesktopWarehouseView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/stock-requests.ts]] — `stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/stock_requests.py]] — 프론트의 입출고 요청 작성, 내 요청, 창고 승인함이 호출하는 API 입구입니다.
- [[ERP/backend/app/services/stock_requests.py]] — 현장 담당자가 요청을 제출하고 창고가 승인/반려/취소하는 흐름을 처리하는 서비스입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Department, DepartmentRole, EmployeeLevel, Item, WarehouseRole } from "@/lib/api";

// ───────────────────────────── Types ─────────────────────────────

export type WorkType =
  | "raw-io"
  | "warehouse-io"
  | "dept-adjustment"
  | "defective-register";
export type Direction = "in" | "out" | "return";
export type TransferDirection = "wh-to-dept" | "dept-to-wh";
export type DefectiveSource = "warehouse" | "production";

type OperatorLike =
  | {
      warehouse_role: WarehouseRole;
      department_role?: DepartmentRole;
      level?: EmployeeLevel;
      department: Department;
    }
  | null
  | undefined;

// ─────────────────────────── Constants ───────────────────────────

export const PAGE_SIZE = 100;

export const PROD_DEPTS: Department[] = ["튜브", "고압", "진공", "튜닝", "조립", "출하"];

export const WORK_TYPES: { id: WorkType; label: string; icon: LucideIcon; description: string }[] = [
  { id: "raw-io",            label: "공급업체 입출고",  icon: Boxes,         description: "창고 입고 · 출고 · 공급업체 반품" },
  { id: "warehouse-io",      label: "창고 ↔ 부서 이동", icon: ArrowLeftRight, description: "창고↔생산부서 이동" },
  { id: "dept-adjustment",   label: "부서 재고 조정",   icon: Workflow,      description: "생산/분해/수량 보정" },
  { id: "defective-register",label: "불량 격리",        icon: AlertTriangle, description: "불량 격리 처리" },
];

export const CAUTION_WORK_TYPES: WorkType[] = ["defective-register"];

export const DEPT_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "창고", value: "창고" },
  { label: "튜브", value: "튜브" },
  { label: "고압", value: "고압" },
  { label: "진공", value: "진공" },
  { label: "튜닝", value: "튜닝" },
  { label: "조립", value: "조립" },
  { label: "출하", value: "출하" },
];
```
