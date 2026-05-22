---
type: file-explanation
source_path: "frontend/lib/api/production.ts"
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

- `productionApi`
- `TransactionSummary`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/lib/api-core.ts]] — 프론트 화면이 백엔드에 요청을 보낼 때 공통으로 쓰는 fetch 보조 파일입니다.
- [[ERP/backend/app/routers/production.py]] — `production.py`는 `production` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.
- [[ERP/frontend/lib/api/types/production.ts]] — `production.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.

## 조심할 점

공용 파일이라 여러 화면에 영향이 퍼질 수 있습니다. 변경 후 대시보드, 입출고, 내역, 관리자 화면을 같이 확인해야 합니다.

## 핵심 발췌

```ts
/**
 * Production / History (transactions) / Exports — `@/lib/api/production`.
 *
 * Round-6 (R6-D7) 분리. 9 메소드:
 *   Production: productionReceipt / checkProduction / getProductionCapacity
 *   Transactions: getTransactions / metaEditTransaction / getTransactionEdits / quantityCorrectTransaction
 *   Exports: getItemsExportUrl / getTransactionsExportUrl
 */

import { fetcher, postJson, toApiUrl } from "../api-core";
import type {
  ProductionCapacity,
  ProductionCheckResponse,
  ProductionReceiptResponse,
  TransactionEditLog,
  TransactionLog,
  TransactionType,
} from "./types";

/** 입출고 내역 KPI 응답 — 카운트 4개. */
export interface TransactionSummary {
  total: number;
  warehouseCount: number;
  deptCount: number;
  adjustCount: number;
  /** dept-bucket 거래의 부서별 카운트 {부서명: 건수}. 배치/부서 없으면 '미상'. */
  departmentCounts: Record<string, number>;
}

export const productionApi = {
  productionReceipt: (payload: {
    item_id: string;
    quantity: number;
    reference_no?: string;
    produced_by?: string;
    notes?: string;
  }) => postJson<ProductionReceiptResponse>(toApiUrl("/api/production/receipt"), payload),

  checkProduction: (itemId: string, quantity: number) =>
    fetcher<ProductionCheckResponse>(
      toApiUrl(`/api/production/bom-check/${itemId}?quantity=${quantity}`),
    ),

  getProductionCapacity: () =>
    fetcher<ProductionCapacity>(toApiUrl("/api/production/capacity")),

  getTransactions: (
    params?: {
      itemId?: string;
      transactionType?: TransactionType;
      transactionTypes?: string; // 쉼표 구분 복수값. 예: "RECEIVE,SHIP"
      referenceNo?: string;
      search?: string;
      department?: string;
      model?: string;        // 제품 모델명 (쉼표 복수)
```
