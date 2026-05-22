---
type: file-explanation
source_path: "frontend/app/legacy/_components/_admin_sections/adminShared.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# adminShared.ts — adminShared.ts 설명

## 이 파일은 무엇을 책임지나

`adminShared.ts`는 관리자 화면의 한 부분을 담당하는 TypeScript/React 코드입니다. 직원, 품목, BOM, 설정 같은 관리 작업과 연결됩니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `bomCategoryColor`
- `PROCESS_TYPE_OPTIONS`
- `MODEL_SLOTS`
- `UNIT_OPTIONS`
- `EMPTY_ADD_FORM`
- `EMPTY_EMPLOYEE_FORM`
- `BOM_PARENT_CATS`
- `BOM_CHILD_CATS`
- `AddForm`
- `EmployeeAddForm`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopAdminView.tsx]] — `DesktopAdminView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/admin.ts]] — `admin.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/settings.py]] — `settings.py`는 `settings` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/backend/app/routers/employees.py]] — `employees.py`는 `employees` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
export const PROCESS_TYPE_OPTIONS = [
  { value: "TR", label: "TR — 튜브 원자재" }, { value: "TA", label: "TA — 튜브 중간공정" }, { value: "TF", label: "TF — 튜브 공정완료" },
  { value: "HR", label: "HR — 고압 원자재" }, { value: "HA", label: "HA — 고압 중간공정" }, { value: "HF", label: "HF — 고압 공정완료" },
  { value: "VR", label: "VR — 진공 원자재" }, { value: "VA", label: "VA — 진공 중간공정" }, { value: "VF", label: "VF — 진공 공정완료" },
  { value: "NR", label: "NR — 튜닝 원자재" }, { value: "NA", label: "NA — 튜닝 중간공정" }, { value: "NF", label: "NF — 튜닝 공정완료" },
  { value: "AR", label: "AR — 조립 원자재" }, { value: "AA", label: "AA — 조립 중간공정" }, { value: "AF", label: "AF — 조립 공정완료" },
  { value: "PR", label: "PR — 출하 원자재" }, { value: "PA", label: "PA — 출하 중간공정" }, { value: "PF", label: "PF — 출하 공정완료" },
];

export const MODEL_SLOTS = [
  { slot: 1, label: "DX3000",   symbol: "3" },
  { slot: 2, label: "COCOON",   symbol: "7" },
  { slot: 3, label: "SOLO",     symbol: "8" },
  { slot: 4, label: "ADX4000W", symbol: "4" },
  { slot: 5, label: "ADX6000",  symbol: "6" },
];

export const UNIT_OPTIONS = ["EA", "SET", "kg", "g", "m", "mm", "L", "box"];

export const EMPTY_ADD_FORM = {
  item_name: "",
  process_type_code: "TR",
  unit: "EA",
  model_slots: [] as number[],
  option_code: "",
  legacy_item_type: "",
  supplier: "",
  min_stock: "",
  initial_quantity: "",
};

export type AddForm = typeof EMPTY_ADD_FORM;

export const EMPTY_EMPLOYEE_FORM = {
  name: "",
  role: "",
  phone: "",
  department: "조립",
  warehouse_role: "none" as "none" | "primary" | "deputy",
  department_role: "none" as "none" | "primary" | "deputy",
  // 조립 부서 직원의 담당 모델 slot 목록 (배열 순서 = 우선순위, 0=1순위).
  assigned_model_slots: [] as number[],
};

export type EmployeeAddForm = typeof EMPTY_EMPLOYEE_FORM;

export const BOM_PARENT_CATS = ["ALL", "AA", "HA", "VA", "TA", "NA", "PA", "AF", "TF", "HF", "VF", "NF", "PF"];
export const BOM_CHILD_CATS = [
  { value: "ALL", label: "전체" },
  { value: "?R",  label: "원자재" },
  { value: "?A",  label: "중간공정" },
  { value: "?F",  label: "공정완료" },
];

export function bomCategoryColor(code?: string | null): string {
```
