---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/HistoryFilterPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# HistoryFilterPanel — 거래 필터 패널 (3카드)

> [!summary] 역할
> 부서·제품모델·거래종류 3카드 다중선택 필터. 부서는 동적(departmentCounts), 거래종류는 전 16종 고정.

## 1. 이 파일의 역할

HistoryFilterBar 아래 드롭으로 표시되는 필터 패널. 3개 카드(부서/모델/거래종류) 각각 다중선택. 부서는 서버 departmentCounts 기반 동적 칩, 모델/거래종류는 고정 옵션. clear 버튼으로 각 카드 전체 선택 해제.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/HistoryFilterPanel.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/HistoryFilterPanel.tsx|원본]])

## 3. 주요 import

- Icons: `Layers`, `Sparkles`, `TrendingUp` from lucide-react
- `LEGACY_COLORS` from `@/lib/mes/color`
- `FilterChip` from `../common`
- `OPERATION_OPTIONS` from `./historyQuery`

## 4. 어디서 쓰이는지

- HistoryDetailPanel 또는 DesktopHistoryRightPanel에서 조건부 렌더
- 부모: 거래 이력 필터 상태

## 5. ⚠️ 위험 포인트

> [!warning] departmentCounts 업데이트 누락 시 칩 개수 미일치
> OPERATION_OPTIONS 고정값 — 거래 종류 변경 시 수동 갱신

## 6. 수정 전 체크

- [ ] departmentCounts 계산 로직(부서별 집계) 일관성 확인
- [ ] 새 거래 종류 추가 시 OPERATION_OPTIONS 갱신
