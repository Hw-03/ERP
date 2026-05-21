---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryStatsBar.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryStatsBar.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/HistoryStatsBar.tsx]]

## 원본 첫 줄

```
"use client";

import { Building2, Layers, Sliders } from "lucide-react";
import type { TransactionSummary } from "@/lib/api/production";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { tint } from "@/lib/mes/colorUtils";

export interface HistoryStatsBarProps {
  /** 기간만 필터한 전체 — 박스 숫자/Y(분모). 필터와 무관하게 고정. */
  baseline: TransactionSummary | null;
  /** 현재 필터(거래종류/검색/부서/모델)가 적용된 건수 — X(분자). */
  currentCount: number | null;
  loading: boolean;
  /** "이번달" / "오늘" / "이번주" / "전체" / 선택한 날짜. */
  periodLabel: string;
}

const NUM = (loading: boolean, n: number | null | undefined) =>
  loading || n == null ? "…" : n.toLocaleString();

/**
 * 입출고 내역 상단 요약 — 3차: **표시 전용**(클릭 필터 폐기, 필터는 "필터" 패널 단일).
 * 카운트는 "{기간} X건 / 전체 Y건" 정직 표기 — X=현재 필터, Y=기간 전체.
 * 3박스(창고/부서/수량조정)는 건수만 보여주는 표시판.
 */
export function HistoryStatsBar({
  baseline,
  currentCount,
  loading,
  periodLabel,
```
