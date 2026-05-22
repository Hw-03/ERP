---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_inventory_sections/InventoryKpiPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# InventoryKpiPanel — 재고 KPI 카드 그리드

> [!summary] 역할
> ALL/NORMAL/LOW/ZERO 4개 KPI 카드 그리드. 활성 필터 선택.

## 1. 이 파일의 역할

재고 상태별(정상/부족/0) KPI 카드 4개(ALL 포함) 2x2 또는 1x4 그리드. KpiCard 하위 컴포넌트 재사용. activeKey로 현재 선택 필터 표시, onChange 콜백으로 필터 전환.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_inventory_sections/InventoryKpiPanel.tsx` ([[erp/frontend/app/legacy\_components\_inventory_sections/InventoryKpiPanel.tsx|원본]])

## 3. 주요 import

- `formatQty` from `@/lib/mes/format`
- `KpiCard` from `../common/KpiCard`

## 4. 어디서 쓰이는지

- DesktopInventoryRightPanel 상단
- 부모: 재고 필터 상태

## 5. ⚠️ 위험 포인트

> [!warning] KpiFilter enum 값과 card.key 일치 필수
> cards 배열 순서 — 렌더 순서 결정

## 6. 수정 전 체크

- [ ] KpiFilter 타입 변경 시 card 데이터 일관성
- [ ] 그리드 반응형 (2칼럼 vs 4칼럼) 레이아웃 검증
