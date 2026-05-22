---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/CapacityDetailModal.tsx
tags: [vault, code-note, frontend, b-tier]
---

# CapacityDetailModal — 생산 능력 상세 모달

> [!summary] 역할
> ProductionCapacity 상세 표시. 상태별 메시지 + top_items 목록.

## 1. 이 파일의 역할

생산 가능 수량 상세 모달. ProductionCapacityStatus(producible/not_producible/bom_not_registered 등) 결정 후 상태별 메시지 표시. top_items 배열로 상위 품목 나열. emptyMessage로 조건별 안내.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/CapacityDetailModal.tsx` ([[erp/frontend/app/legacy/_components/CapacityDetailModal.tsx|원본]])

## 3. 주요 import

- `ProductionCapacity`, `ProductionCapacityStatus` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `formatQty` from `@/lib/mes/format`

## 4. 어디서 쓰이는지

- DesktopLegacyShell에서 InventoryCapacityPanel 클릭 시 모달
- 부모: 생산 능력 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] capacityData null 시 로딩 메시지 — state 동기화 필수
> status 결정 로직 복잡 — fallback 검증

## 6. 수정 전 체크

- [ ] ProductionCapacityStatus enum 변경 시 switch 케이스 갱신
- [ ] top_items 구조 변경 시 렌더 로직 점검
