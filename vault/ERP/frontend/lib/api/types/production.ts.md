---
type: file-explanation
source_path: "frontend/lib/api/types/production.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# production.ts — production.ts 설명

## 이 파일은 무엇을 책임지나

`production.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `ProductionCapacityStatus`
- `TransactionLog`
- `TransactionEditLog`
- `ProductionCheckComponent`
- `ProductionCheckResponse`
- `ProductionCapacityItem`
- `ProductionCapacity`
- `BackflushDetail`
- `ProductionReceiptResponse`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/production.py]] — `production.py`는 `production` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Production / Transactions 도메인 타입 — `@/lib/api/types/production`.
 * Round-10A (#2) 본문 이전.
 */

import type { TransactionType } from "./shared";

export interface TransactionLog {
  log_id: string;
  item_id: string;
  mes_code: string | null;
  item_name: string;
  item_process_type_code: string | null;
  item_unit: string;
  transaction_type: TransactionType;
  quantity_change: number;
  quantity_before: number | null;
  quantity_after: number | null;
  transfer_qty: number | null;
  reference_no: string | null;
  produced_by: string | null;
  requester_name: string | null;
  notes: string | null;
  operation_batch_id: string | null;
  created_at: string;
  /** 3차: 수정 이력 개수 (서버 응답에 포함). */
  edit_count?: number;
}

/** 거래 수정 이력 (3차 메타 수정 + 4차 수량 보정 공통). */
export interface TransactionEditLog {
  edit_id: string;
  original_log_id: string;
  edited_by_employee_id: string;
  edited_by_name: string;
  reason: string;
  before_payload: string; // JSON string
  after_payload: string; // JSON string
  correction_log_id: string | null;
  created_at: string;
}

export interface ProductionCheckComponent {
  mes_code: string | null;
  item_name: string;
  process_type_code: string | null;
  unit: string;
  required: number;
  current_stock: number;
  shortage: number;
  ok: boolean;
}

export interface ProductionCheckResponse {
  item_id: string;
```
