---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryCalendarPanel.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryCalendarPanel.tsx — HistoryCalendarPanel.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryCalendarPanel.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryCalendarPanel`
- `HistoryCalendarPanelProps`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/frontend/app/legacy/_components/DesktopHistoryView.tsx]] — `DesktopHistoryView.tsx`는 현재 운영 중인 MES 화면을 구성하는 React 컴포넌트입니다.
- [[ERP/frontend/lib/api/inventory.ts]] — `inventory.ts`는 프론트엔드가 백엔드 API를 호출할 때 쓰는 도메인별 통신 함수입니다.
- [[ERP/backend/app/routers/inventory/transactions.py]] — `transactions.py`는 재고 업무 API 중 한 영역을 맡는 Python 코드입니다. 화면에서 들어온 요청을 검증하고 실제 재고 서비스로 넘기는 관문입니다.

## 조심할 점

현재 실제 운영 화면입니다. 작은 문구나 상태 변경도 현장 사용 흐름에 영향을 줄 수 있습니다.

## 핵심 발췌

```tsx
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
  prevMonth,
  nextMonth,
  calendarLoading,
  calendarDays,
  calendarDayMap,
  todayKey,
  selectedDay,
  setSelectedDay,
}: HistoryCalendarPanelProps) {
  if (!open) return null;
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <HistoryCalendarStrip
        calendarYear={calendarYear}
        calendarMonth={calendarMonth}
        prevMonth={prevMonth}
        nextMonth={nextMonth}
        calendarLoading={calendarLoading}
        calendarDays={calendarDays}
        calendarDayMap={calendarDayMap}
        todayKey={todayKey}
        selectedDay={selectedDay}
        setSelectedDay={setSelectedDay}
      />
      <div
```
