---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryFilterBar.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryFilterBar — 거래 이력 검색/필터 바

> [!summary] 역할
> 상단 한 줄 컨트롤: 검색·기간·필터 버튼·달력. 선택 날짜 칩.

## 1. 이 파일의 역할

거래 이력 필터링 바. 텍스트 검색, 기간 선택(DATE_OPTIONS), 필터 패널 토글, 달력 토글 등 4가지 컨트롤. activeFilterCount 배지로 활성 필터 개수 표시. selectedDay 칩으로 달력에서 고른 날짜 표시. 부모가 필터 패널·달력 strip 렌더.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryFilterBar.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryFilterBar.tsx|원본]])

## 3. 주요 import

- Icons: `CalendarDays`, `ChevronDown`, `Filter`, `Search`, `X` from lucide-react
- `LEGACY_COLORS` from `@/lib/mes/color`
- `DATE_OPTIONS` from `./historyQuery`

## 4. 어디서 쓰이는지

- DesktopHistoryRightPanel 또는 HistoryDetailPanel 상단
- 부모: 거래 이력 필터 조건 관리

## 5. ⚠️ 위험 포인트

> [!warning] activeFilterCount 부모가 계산 — 불일치 시 배지 오류

## 6. 수정 전 체크

- [ ] DATE_OPTIONS 값 변경 시 sync 확인
- [ ] 새 필터 타입 추가 후 배지 카운트 로직 갱신
