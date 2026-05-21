---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/__tests__/historyShared.golden.test.ts
tags: [vault, code-note, auto-generated, stub]
---

# historyShared.golden.test.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/__tests__/historyShared.golden.test.ts]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
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
```
