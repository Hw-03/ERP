---
type: file-explanation
source_path: "frontend/app/legacy/_components/_history_sections/HistoryFilterBar.tsx"
importance: important
layer: frontend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# HistoryFilterBar.tsx — HistoryFilterBar.tsx 설명

## 이 파일은 무엇을 책임지나

`HistoryFilterBar.tsx`는 입출고 내역 화면에서 날짜, 목록, 상세, 묶음 작업을 보여주는 화면 부품입니다.

## 업무 흐름에서의 의미

사용자가 화면에서 보고 누르는 경험과 직접 연결됩니다. 문구, 버튼, 표, 상세 패널 개선은 이 계층에서 확인합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `HistoryFilterBar`
- `Props`

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

import { CalendarDays, ChevronDown, Filter, Search, X } from "lucide-react";
import { LEGACY_COLORS } from "@/lib/mes/color";
import { DATE_OPTIONS } from "./historyQuery";

// 3차 C8: 상단 컨트롤 한 줄 통합 — [검색][기간][필터][달력] + 선택날짜 칩.
// 거래 유형 칩 줄·"적용됨" 요약 줄은 폐기(거래 종류 = "필터" 패널 카드).
// 필터 패널 3카드·달력 strip 은 이 줄 아래 전체폭으로 드롭(부모가 렌더).
type Props = {
  search: string;
  setSearch: (v: string) => void;
  dateFilter: string;
  setDateFilter: (v: string) => void;
  filterPanelOpen: boolean;
  onToggleFilterPanel: () => void;
  /** selectedDepts+selectedModels+selectedOps 합 — 필터 버튼 배지. */
  activeFilterCount: number;
  calendarOpen: boolean;
  onToggleCalendar: () => void;
  /** 달력에서 고른 날짜(YYYY-MM-DD). null = 미선택. */
  selectedDay: string | null;
  onClearSelectedDay: () => void;
};

export function HistoryFilterBar({
  search,
  setSearch,
  dateFilter,
  setDateFilter,
  filterPanelOpen,
  onToggleFilterPanel,
  activeFilterCount,
  calendarOpen,
  onToggleCalendar,
  selectedDay,
  onClearSelectedDay,
}: Props) {
  return (
    <section className="card" style={{ paddingTop: 14, paddingBottom: 14 }}>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex min-h-[44px] flex-1 items-center gap-2 rounded-[12px] border px-3 py-2 lg:min-h-0"
          style={{ background: LEGACY_COLORS.s2, borderColor: LEGACY_COLORS.border }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: LEGACY_COLORS.blue }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="품명 · 코드 · 담당자 · 참조번호 · 메모"
            className="h-11 flex-1 bg-transparent text-sm outline-none lg:h-auto"
            style={{ color: LEGACY_COLORS.text }}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-xs" style={{ color: LEGACY_COLORS.muted2 }}>
```
