---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryDetailEditHistory.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryDetailEditHistory.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/HistoryDetailEditHistory.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { TransactionEditLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { parseUtc } from "./historyFormat";

/**
 * Round-13 (#3) 추출 — HistoryDetailPanel 의 수정 이력 본문.
 * Phase4 (#F4): 외부 카드 wrapper 제거 — 부모 Collapsible 이 카드와 헤더 담당.
 */
export function HistoryDetailEditHistory({ edits }: { edits: TransactionEditLog[] }) {
  return (
    <div className="space-y-2">
      {edits.map((e) => (
        <div
          key={e.edit_id}
          className="rounded-[12px] border p-3 text-sm"
          style={{ background: LEGACY_COLORS.s1, borderColor: LEGACY_COLORS.border }}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold" style={{ color: LEGACY_COLORS.text }}>
              {e.edited_by_name}
            </span>
            <span className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
              {parseUtc(e.created_at).toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
            사유: <span style={{ color: LEGACY_COLORS.text }}>{e.reason}</span>
          </div>
```
