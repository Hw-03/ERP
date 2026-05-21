---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx
tags: [vault, code-note, auto-generated, stub]
---

# DraftCartItemRow.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import type { StockRequest } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { normalizeDepartment } from "@/lib/mes/department";
import { formatQty } from "@/lib/mes/format";
import { REQUEST_TYPE_LABEL } from "./ioRequestLabels";

/**
 * Round-13 (#7) 추출 — DraftCartPanel 의 단일 draft 카드.
 *
 * draft 메타 + lines 미리보기 (최대 5건) + 이어서/삭제 버튼 2개 행.
 */
export interface DraftCartItemRowProps {
  draft: StockRequest;
  isBusy: boolean;
  onContinue: () => void;
  onRequestDelete: () => void;
}

export function DraftCartItemRow({
  draft,
  isBusy,
  onContinue,
  onRequestDelete,
}: DraftCartItemRowProps) {
  const totalQty = draft.lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  return (
    <div
```
