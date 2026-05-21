---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_weekly_sections/WeeklyDetailTable.tsx
tags: [vault, code-note, auto-generated, stub]
---

# WeeklyDetailTable.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_weekly_sections/WeeklyDetailTable.tsx]]
> 신입이 자주 보게 되면 A/B/C 계층으로 승격 예정.

## 원본 첫 줄

```
"use client";

import { memo } from "react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { formatQty } from "@/lib/mes/format";
import type { WeeklyGroupReport } from "@/lib/api/types/weekly";
import { EmptyState } from "../common/EmptyState";

// 0 값 de-emphasis — WCAG AA 충족(투명 30% 는 미달) → 솔리드 muted2(5.55:1).
const ZERO_FADE = LEGACY_COLORS.muted2;

interface Props {
  group: WeeklyGroupReport | undefined;
}

function WeeklyDetailTableImpl({ group }: Props) {
  if (!group || group.items.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title="해당 공정완료품 데이터가 없습니다."
        description="선택한 주차에 집계할 품목 또는 거래 내역이 없습니다."
        compact
      />
    );
  }

  return (
    <div className="flex flex-col gap-0 min-w-0">
      {/* 공정 요약 */}
```
