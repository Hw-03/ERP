---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/transactionTaxonomy.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# transactionTaxonomy.ts — transactionTaxonomy.ts 설명

## 이 파일은 무엇을 책임지나

`transactionTaxonomy.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `getDefaultHistoryScopeForOperator`
- `isWarehouseInvolvedType`
- `isDepartmentInternalType`
- `isAmbiguousType`
- `isExceptionLike`
- `isAdjustmentLike`
- `isHiddenHistoryType`
- `isReworkOperation`
- `classifyHistoryScope`
- `SCOPE_LABELS`
- 그 외 5개 항목

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
 * transactionTaxonomy.ts — 거래 타입 분류 상수·술어·scope 모델.
 * C3: historyShared.ts 에서 추출. 소비자는 historyShared 재export 또는 직접 import.
 */
import type { TransactionType } from "@/lib/api/types/shared";
import type { IoBatch } from "@/lib/api/types/io";

// ──────────────────────────────────────────────────────────────────
// Scope 모델
// ──────────────────────────────────────────────────────────────────

export type HistoryScope = "ALL" | "WAREHOUSE_INVOLVED" | "DEPT_INTERNAL";

export const SCOPE_LABELS: Record<HistoryScope, string> = {
  ALL: "전체",
  WAREHOUSE_INVOLVED: "창고",
  DEPT_INTERNAL: "부서",
};

/**
 * 사용자별 입출고 내역 기본 scope.
 * warehouse_role 이 "primary" 또는 "deputy" 이면 창고 담당 → WAREHOUSE_INVOLVED.
 * 그 외(none 포함) → DEPT_INTERNAL.
 */
export function getDefaultHistoryScopeForOperator(
  operator: { warehouse_role?: string | null } | null,
): HistoryScope {
  const role = operator?.warehouse_role?.toLowerCase();
  if (role === "primary" || role === "deputy") return "WAREHOUSE_INVOLVED";
  return "DEPT_INTERNAL";
}

// ──────────────────────────────────────────────────────────────────
// 거래 타입 분류 상수
// ──────────────────────────────────────────────────────────────────

export const WAREHOUSE_INVOLVED_TYPES: readonly TransactionType[] = [
  "RECEIVE", "SHIP", "TRANSFER_TO_PROD", "TRANSFER_TO_WH",
] as const;

export const DEPT_INTERNAL_TYPES: readonly TransactionType[] = [
  "TRANSFER_DEPT", "BACKFLUSH", "PRODUCE", "DISASSEMBLE",
] as const;

// 타입만으로 scope 확정 불가 — IoBatch.lines.from_bucket/to_bucket 참고 필요.
export const AMBIGUOUS_TYPES: readonly TransactionType[] = [
  "ADJUST", "MARK_DEFECTIVE", "SUPPLIER_RETURN",
] as const;

// "예외/정정" 칩/카드 기준 (UX). KPI 카운트에는 edit_count>0 도 포함됨.
export const EXCEPTION_LIKE_TYPES: readonly TransactionType[] = [
  "ADJUST", "MARK_DEFECTIVE", "SUPPLIER_RETURN",
] as const;

const _wh = new Set<string>(WAREHOUSE_INVOLVED_TYPES);
```
