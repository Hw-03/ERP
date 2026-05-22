---
type: file-explanation
source_path: "frontend/lib/api/types/shared.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# shared.ts — shared.ts 설명

## 이 파일은 무엇을 책임지나

`shared.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ProcessTypeCode`
- `TransactionType`
- `LocationStatus`
- `Department`
- `EmployeeLevel`
- `WarehouseRole`
- `DepartmentRole`
- `InventoryLocationRow`
- `ProcessTypeSummary`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * 공통 / cross-domain 타입 — `@/lib/api/types/shared`.
 *
 * 5개 이상 도메인이 참조하는 8종을 정본으로 보관.
 * Round-10A (#2) 에서 types.ts 본문 이전 — 도메인 파일들이 본 파일에서 import.
 */

export type ProcessTypeCode =
  | "TR" | "TA" | "TF"
  | "HR" | "HA" | "HF"
  | "VR" | "VA" | "VF"
  | "NR" | "NA" | "NF"
  | "AR" | "AA" | "AF"
  | "PR" | "PA" | "PF";

export type TransactionType =
  | "RECEIVE"
  | "PRODUCE"
  | "SHIP"
  | "ADJUST"
  | "BACKFLUSH"
  | "DISASSEMBLE"
  | "TRANSFER_TO_PROD"
  | "TRANSFER_TO_WH"
  | "TRANSFER_DEPT"
  | "MARK_DEFECTIVE"
  | "SUPPLIER_RETURN";

export type LocationStatus = "PRODUCTION" | "DEFECTIVE";

export type Department =
  | "조립"
  | "고압"
  | "진공"
  | "튜닝"
  | "튜브"
  | "AS"
  | "연구"
  | "영업"
  | "출하"
  | "기타";

export type EmployeeLevel = "admin" | "manager" | "staff";

export type WarehouseRole = "none" | "primary" | "deputy";

export type DepartmentRole = "none" | "primary" | "deputy";

export interface InventoryLocationRow {
  department: Department;
  status: LocationStatus;
  quantity: number;
}

export interface ProcessTypeSummary {
```
