---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/SelectedItemsPanel.tsx
tags: [vault, code-note, frontend, b-tier]
---

# SelectedItemsPanel — 선택 품목 패널

> [!summary] 역할
> SelectedEntry 목록 표시. 수량 조정, 삭제. 입/출고 구분(expected 계산).

## 1. 이 파일의 역할

입출고에서 선택한 품목들(Item + quantity) 목록. outgoing 플래그로 입/출 구분하여 expected 계산. shortage 표시(빨강/노랑/초록), 수량 수정, 품목 삭제. entries 배열 length 0 시 null 반환.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/SelectedItemsPanel.tsx` ([[erp/frontend/app/legacy/_components/SelectedItemsPanel.tsx|원본]])

## 3. 주요 import

- `Item` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `itemCodeDeptBadge` from `@/lib/mes/process`
- `getStockState` from `@/lib/mes/inventory`
- `formatQty` from `@/lib/mes/format`
- `useDeptColorLookup` from `./DepartmentsContext`
- Icon: `X` from lucide-react

## 4. 어디서 쓰이는지

- 입출고 작업 중 선택 품목 목록 표시
- 부모: warehouse/IO 작업 view

## 5. ⚠️ 위험 포인트

> [!warning] outgoing 플래그 — 입/출 로직 구분 필수
> expected < 0 → shortage 표시 (빨강)

## 6. 수정 전 체크

- [ ] SelectedEntry 타입 확장 시 렌더 로직 갱신
- [ ] getStockState 로직 min_stock null 대응
