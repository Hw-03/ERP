---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryFilterBar.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryFilterBar — 재고 검색/필터 바

> [!summary] 역할
> 검색·필터 토글·선택 필터 칩. 부서/제품모델/공정단계 3개 필터 패널.

## 1. 이 파일의 역할

재고 페이지 상단 검색·필터 제어. FilterChip으로 선택된 필터 표시(부서/모델/공정단계). 고정 부서 6개(DEPT_CHIPS), 공정단계 3개(R/A/F), 제품모델은 dynamic. clear 버튼으로 각 필터 전체 해제.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryFilterBar.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryFilterBar.tsx|원본]])

## 3. 주요 import

- Icons: `Layers`, `Search`, `Sparkles`, `TrendingUp` from lucide-react
- `ProductModel` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `FilterChip` from `../common`

## 4. 어디서 쓰이는지

- DesktopInventoryView 상단
- 부모: 재고 필터 상태

## 5. ⚠️ 위험 포인트

> [!warning] DEPT_CHIPS 고정값 — 부서 추가 시 수동 갱신
> productModels dynamic — 없으면 칩 미표시

## 6. 수정 전 체크

- [ ] DEPT_CHIPS/PROCESS_STEP_CHIPS 변경 후 필터 로직 동기화
- [ ] toggle* 함수 중복 호출 방지
