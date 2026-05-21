---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/lib/api/types/production.ts
tags: [vault, code-note, auto-generated, stub]
---

# production.ts

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/lib/api/types/production.ts]]

## 원본 첫 줄

```
/**
 * Production / Transactions 도메인 타입 — `@/lib/api/types/production`.
 * Round-10A (#2) 본문 이전.
 */

import type { TransactionType } from "./shared";

export interface TransactionLog {
  log_id: string;
  item_id: string;
  item_code: string | null;
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
```
