---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryCalendarPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryCalendarPanel — 거래 달력 본문

> [!summary] 역할
> HistoryFilterBar 아래 드롭으로 표시되는 달력. 날짜별 거래 카운트 시각화.

## 1. 이 파일의 역할

거래 이력 달력 뷰. HistoryCalendarStrip 자식으로 렌더, 월 네비 및 로딩 상태 표시. calendarDayMap으로 각 날짜의 거래 목록 조회. selectedDay 클릭으로 특정 날짜 선택. open=false면 null 반환.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryCalendarPanel.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryCalendarPanel.tsx|원본]])

## 3. 주요 import

- `TransactionLog` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `HistoryCalendarStrip` (자식)

## 4. 어디서 쓰이는지

- HistoryDetailPanel 또는 DesktopHistoryRightPanel에서 조건부 렌더
- 부모: 거래 달력 상태 관리

## 5. ⚠️ 위험 포인트

> [!warning] calendarDayMap 빌드 성능 — 대량 거래 시 지연 가능
> selectedDay null 체크 필수

## 6. 수정 전 체크

- [ ] 월 네비(prevMonth/nextMonth) 연도 변경 처리
- [ ] calendarDays 구조 변경 시 HistoryCalendarStrip sync
