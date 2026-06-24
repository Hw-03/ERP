---
type: file-explanation
source_path: "frontend/lib/api/types/stock-requests.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# stock-requests.ts — stock-requests.ts 설명

## 이 파일은 무엇을 책임지나

`stock-requests.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `StockRequestStatus`
- `StockRequestType`
- `RequestBucket`
- `StockRequestLine`
- `StockRequest`
- `StockRequestCreatePayload`
- `StockRequestDraftUpsertPayload`
- `StockRequestActionPayload`
- `StockRequestReservationLine`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Stock requests 도메인 타입 — `@/lib/api/types/stock-requests`.
 * (작업자 결재 요청 흐름)
 * Round-10A (#2) 본문 이전.
 */

import type { Department } from "./shared";

export type StockRequestStatus =
  | "draft"
  | "submitted"
  | "reserved"
  | "rejected"
  | "cancelled"
  | "completed"
  | "failed_approval";

export type StockRequestType =
  | "raw_receive"
  | "raw_ship"
  | "warehouse_to_dept"
  | "dept_to_warehouse"
  | "dept_internal"
  | "mark_defective_wh"
  | "mark_defective_prod"
  | "supplier_return"
  | "manual_adjustment"
  | "defect_scrap"
  | "defect_return"
  | "defect_disassemble"
  | "scrap_normal"
  | "return_normal";

export type RequestBucket = "warehouse" | "production" | "defective" | "none";

export interface StockRequestLine {
  line_id: string;
  request_id: string;
  item_id: string;
  item_name_snapshot: string;
  mes_code_snapshot: string | null;
  quantity: number;
  from_bucket: RequestBucket;
  from_department: Department | null;
  to_bucket: RequestBucket;
  to_department: Department | null;
  status: StockRequestStatus;
  created_at: string;
}

export interface StockRequest {
  request_id: string;
  request_code: string | null;
  requester_employee_id: string;
  requester_name: string;
  requester_department: Department;
  request_type: StockRequestType;
```
