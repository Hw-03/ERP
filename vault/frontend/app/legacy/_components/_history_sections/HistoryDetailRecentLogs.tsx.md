---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryDetailRecentLogs.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryDetailRecentLogs.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/HistoryDetailRecentLogs.tsx]]

## 원본 첫 줄

```
"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { transactionColor } from "@/lib/mes-status";
import { formatQty } from "@/lib/mes/format";
import { formatHistoryDate } from "./historyFormat";
import { getHistoryDisplayLabel } from "./historyBatchInterpreter";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 "이 품목의 최근 거래" 리스트.
 * Phase4 (#F4): 외부 카드 wrapper 제거 — 부모 Collapsible 이 카드와 헤더 담당.
 */
export function HistoryDetailRecentLogs({
  itemRecentLogs,
  onSelectLog,
}: {
  itemRecentLogs: TransactionLog[];
  onSelectLog: (log: TransactionLog) => void;
}) {
  if (itemRecentLogs.length === 0) {
    return (
      <div className="text-sm" style={{ color: LEGACY_COLORS.muted2 }}>최근 거래 없음</div>
    );
  }
  return (
    <div className="space-y-2">
      {itemRecentLogs.map((log) => (
        <button
          key={log.log_id}
```
