---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryStatsBar.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryStatsBar — 거래 요약 통계 바

> [!summary] 역할
> 기간별 거래 카운트 요약. "{기간} X건 / 전체 Y건" 정직 표기. 3박스(창고/부서/수량조정) 건수 표시판.

## 1. 이 파일의 역할

거래 이력 페이지 상단 통계 요약. baseline(기간 전체)과 currentCount(필터 적용) 비교. loading 상태에서 "…" 표시. periodLabel로 기간(이번달/오늘/전체 등) 안내. 표시 전용(클릭 필터 없음).

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryStatsBar.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryStatsBar.tsx|원본]])

## 3. 주요 import

- Icons: `Building2`, `Layers`, `Sliders` from lucide-react
- `TransactionSummary` from `@/lib/api/production`
- `LEGACY_COLORS`, `tint` from `@/lib/mes/color[Utils]`

## 4. 어디서 쓰이는지

- HistoryDetailPanel 또는 DesktopHistoryRightPanel 상단
- 부모: 거래 통계 state (baseline, currentCount)

## 5. ⚠️ 위험 포인트

> [!warning] baseline null 시 부모 책임 — 숫자 포맷 실패 방지

## 6. 수정 전 체크

- [ ] periodLabel 형식 일관성 확인
- [ ] 3박스 카운트 소스(TransactionSummary 필드) 정합성
