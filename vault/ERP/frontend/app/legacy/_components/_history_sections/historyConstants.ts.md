---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/historyConstants.ts
tags: [vault, code-note, auto-generated, stub]
---

# historyConstants.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/historyConstants.ts]]

## 원본 첫 줄

```
/**
 * historyConstants.ts — history 공통 상수·타입.
 * Phase F1-2: historyShared.ts 에서 추출.
 */
import type { TransactionLog } from "@/lib/api";

// ──────────────────────────────────────────────────────────────────
// 우측 상세 패널 선택 모델 (history-batch-detail-2026-05-15)
// ──────────────────────────────────────────────────────────────────
export type HistorySelection =
  | { kind: "log"; log: TransactionLog }
  | { kind: "batch"; batchId: string; logs: TransactionLog[] };

export const HISTORY_PAGE_SIZE = 100;
```
