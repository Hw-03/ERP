---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: stub
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryCalendarPanel.tsx
tags: [vault, code-note, auto-generated, stub]
---

# HistoryCalendarPanel.tsx

> [!info] 자동 생성된 stub 노트
> 이 노트는 자동 보정으로 생성됐다. 원본 위치: [[erp/frontend/app/legacy/_components/_history_sections/HistoryCalendarPanel.tsx]]

## 원본 첫 줄

```
"use client";

import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { HistoryCalendarStrip } from "./HistoryCalendarStrip";

/**
 * 입출고 내역 달력 본문 — 3차 C8: 자체 헤더/토글 제거.
 * 토글 버튼·연월·"선택:{날짜}✕" 칩은 HistoryFilterBar 컨트롤 줄로 이관.
 * (연·월 라벨은 HistoryCalendarStrip 의 월 네비에 이미 존재.)
 * open=false 면 아무것도 렌더하지 않음.
 */
export interface HistoryCalendarPanelProps {
  open: boolean;
  calendarYear: number;
  calendarMonth: number;
  prevMonth: () => void;
  nextMonth: () => void;
  calendarLoading: boolean;
  calendarDays: (number | null)[];
  calendarDayMap: Map<string, TransactionLog[]>;
  todayKey: string;
  selectedDay: string | null;
  setSelectedDay: (key: string | null) => void;
}

export function HistoryCalendarPanel({
  open,
  calendarYear,
  calendarMonth,
```
