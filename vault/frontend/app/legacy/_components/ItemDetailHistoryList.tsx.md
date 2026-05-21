---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/ItemDetailHistoryList.tsx
tags: [vault, code-note, auto-generated, stub]
---

# ItemDetailHistoryList.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/ItemDetailHistoryList.tsx]]

## 원본 첫 줄

```
"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { getTransactionLabel, transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
export interface ItemDetailHistoryListProps {
  logs: TransactionLog[];
}

/**
 * ItemDetailSheet 의 "최근 입출고" 이력 리스트.
 * Round-9 (R9-3) 분리. 동작/스타일 변화 0.
 */
export function ItemDetailHistoryList({ logs }: ItemDetailHistoryListProps) {
  return (
    <>
      <div className="mb-[6px] text-[10px] font-bold uppercase tracking-[1.5px]" style={{ color: LEGACY_COLORS.muted }}>
        📋 최근 입출고
      </div>
      <div className="overflow-hidden rounded-[14px] border" style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}>
        {logs.length === 0 ? (
          <div className="px-[14px] py-4 text-sm" style={{ color: LEGACY_COLORS.muted2 }}>
            최근 이력이 없습니다.
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={log.log_id}
              className="flex items-start gap-2 px-[14px] py-[10px]"
```
