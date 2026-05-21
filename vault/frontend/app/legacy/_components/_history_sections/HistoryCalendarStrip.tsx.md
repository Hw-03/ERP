---
type: code-note
project: ERP
layer: frontend
source_path: erp/frontend/app/legacy/_components/_history_sections/HistoryCalendarStrip.tsx
status: active
updated: 2026-04-27
source_sha: a4831b862124
tags:
  - erp
  - frontend
  - frontend-component
  - tsx
---

# HistoryCalendarStrip.tsx

> [!summary] 역할
> Next.js/React 화면 또는 UI 컴포넌트로, 실제 사용자 경험의 일부를 렌더링한다.

## 원본 위치

- Source: `frontend/app/legacy/_components/_history_sections/HistoryCalendarStrip.tsx`
- Layer: `frontend`
- Kind: `frontend-component`
- Size: `8001` bytes

## 연결

- Parent hub: [[frontend/app/legacy/_components/_history_sections/_history_sections|frontend/app/legacy/_components/_history_sections]]
- Related: [[frontend/frontend]]

## 읽는 포인트

- 현재 실제 UI는 `frontend/app/legacy` 흐름이다.
- 컴포넌트 변경 시 `frontend/lib/api.ts` 타입과 백엔드 응답을 함께 확인한다.

## 원본 발췌

````tsx
"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { TransactionLog } from "@/lib/api";
import { LEGACY_COLORS, formatNumber, transactionColor, transactionLabel } from "../legacyUi";
import { EmptyState } from "../common/EmptyState";
import { formatHistoryDate } from "./historyShared";

type Props = {
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
  selectedDayLogs: TransactionLog[];
  selectedLogId: string | undefined;
  onSelectLog: (log: TransactionLog) => void;
};

export function HistoryCalendarStrip({
  calendarYear,
  calendarMonth,
  prevMonth,
  nextMonth,
  calendarLoading,
  calendarDays,
  calendarDayMap,
  todayKey,
  selectedDay,
  setSelectedDay,
# ... (이하 148줄 생략. 원본 참조)

````
