---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/historyQuery.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# historyQuery.ts — historyQuery.ts 설명

## 이 파일은 무엇을 책임지나

`historyQuery.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `getPeriodStart`
- `dateFilterToFrom`
- `OPERATION_OPTIONS`
- `DATE_OPTIONS`
- `OperationOption`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```ts
/**
 * historyQuery.ts — query/필터/기간 조립 심볼.
 * 3차: scope·타입칩 bucket 로직 폐기(KPI 표시전용·필터 패널 단일화).
 * 거래 종류는 OPERATION_OPTIONS(전 11종) 다중. 서버 transaction_types 필터는
 * 백엔드 _operation_filter 가 sub_type 우선 "화면 구분" 기준으로 해석한다.
 */
import type { TransactionType } from "@/lib/api/types/shared";

// ──────────────────────────────────────────────────────────────────
// 거래 종류 옵션 — 전 11종 고정, 다중 선택.
// 값 = transaction_type 코드. 라벨 = historyBatchInterpreter.ts 의 _TX_OPERATION 과 동일.
// 프런트는 코드만 전송하고, batch.sub_type 우선 매핑은 백엔드가 담당(목록 구분명과 필터 일치).
// ──────────────────────────────────────────────────────────────────
export type OperationOption = { value: TransactionType; label: string };

export const OPERATION_OPTIONS: OperationOption[] = [
  { value: "RECEIVE", label: "원자재 입고" },
  { value: "PRODUCE", label: "생산 등록" },
  { value: "SHIP", label: "출고" },
  { value: "BACKFLUSH", label: "자동 차감" },
  { value: "TRANSFER_TO_PROD", label: "창고 반출" },
  { value: "TRANSFER_TO_WH", label: "창고 반입" },
  { value: "TRANSFER_DEPT", label: "부서 이동" },
  { value: "DISASSEMBLE", label: "재작업" },
  { value: "ADJUST", label: "수량 조정" },
  { value: "MARK_DEFECTIVE", label: "불량 처리" },
  { value: "SUPPLIER_RETURN", label: "공급사 반품" },
];

export const DATE_OPTIONS = [
  { label: "전체", value: "ALL" },
  { label: "오늘", value: "TODAY" },
  { label: "이번주", value: "WEEK" },
  { label: "이번달", value: "MONTH" },
];

export function getPeriodStart(value: string): Date | null {
  const now = new Date();
  if (value === "TODAY") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (value === "WEEK") {
    const copy = new Date(now);
    copy.setDate(copy.getDate() - copy.getDay());
    copy.setHours(0, 0, 0, 0);
    return copy;
  }
  if (value === "MONTH") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

/** dateFilter 값(`TODAY`/`WEEK`/`MONTH`/`ALL`) → date_from 쿼리 파라미터(YYYY-MM-DD). */
export function dateFilterToFrom(dateFilter: string): string | undefined {
  const d = getPeriodStart(dateFilter);
  if (!d) return undefined;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
```
