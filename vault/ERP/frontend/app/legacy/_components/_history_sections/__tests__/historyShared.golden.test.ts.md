---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/__tests__/historyShared.golden.test.ts"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# historyShared.golden.test.ts — historyShared.golden.test.ts 설명

## 이 파일은 무엇을 책임지나

`historyShared.golden.test.ts`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

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
 * C1 패리티 골든 테스트 — historyShared.ts 공개 함수의 현재 출력을 스냅샷으로 고정.
 * 이후 모든 증분(C2–C6)에서 이 테스트가 100% 그린이어야 동작 보존 증명.
 * 소스 변경 없이 현재 출력값을 expect 에 하드코딩.
 */
import { describe, it, expect } from "vitest";
import type { IoBatch, IoBundle, IoLine } from "@/lib/api/types/io";
import {
  getHistoryDisplayLabel,
  getHistoryDisplaySubLabel,
  getHistoryOperationLabel,
  getHistoryFlowLabel,
  describeBatchFlow,
  getBatchFlowEndpoints,
  getHistoryLineSignedQuantity,
  getHistoryMovementSummary,
  getHistoryBomParentLine,
  getHistoryLineStatusLabel,
} from "../historyBatchInterpreter";
import {
  classifyHistoryScope,
  getDefaultHistoryScopeForOperator,
  isExceptionLike,
  isAdjustmentLike,
  isReworkOperation,
} from "../transactionTaxonomy";
import {
  getPeriodStart,
  dateFilterToFrom,
} from "../historyQuery";
import { rowTint } from "../historyTheme";
import { parseUtc, formatHistoryDate, formatHistoryDateTimeLong, toDateKey } from "../historyFormat";

// ──────────────────────────────────────────────────────────────────
// 공통 픽스처 빌더
// ──────────────────────────────────────────────────────────────────

function makeLine(overrides: Partial<IoLine> = {}): IoLine {
  return {
    line_id: "l1",
    item_id: "ITEM-001",
    item_name: "테스트 부품",
    item_code: null,
    unit: "EA",
    direction: "in",
    from_bucket: "none",
    from_department: null,
    to_bucket: "warehouse",
    to_department: null,
    quantity: 10,
    bom_expected: null,
    included: true,
    origin: "direct",
    edited: false,
    has_children: false,
```
