---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/ItemDetailSheet.tsx
tags: [vault, code-note, frontend, b-tier]
---

# ItemDetailSheet — 품목 상세 Bottom Sheet

> [!summary] 역할
> Item 상세 조회/편집. 3개 탭(요약/위치/거래). 수동 재고 조정 액션.

## 1. 이 파일의 역할

BottomSheet로 표시되는 Item 상세. tab (summary/locations/history)로 3개 뷰 전환. ADJUST/ADD/REMOVE 모드로 수량 조정. ItemDetailActionForm + ItemDetailHistoryList 자식 컴포넌트. onSaved 콜백으로 업데이트 반영.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/ItemDetailSheet.tsx` ([[erp/frontend/app/legacy/_components/ItemDetailSheet.tsx|원본]])

## 3. 주요 import

- React: `useEffect`, `useState`
- `api`, `InventoryLocationRow`, `Item`, `TransactionLog` from `@/lib/api`
- `BottomSheet` from `@/lib/ui/BottomSheet`
- `ItemDetailHistoryList`, `ItemDetailActionForm` from local
- `LEGACY_COLORS` from `@/lib/mes/color`
- `useDeptColor`, `useDeptColorLookup` from `./DepartmentsContext`
- `SegmentedControl` from `./mobile/primitives`

## 4. 어디서 쓰이는지

- 재고 페이지에서 품목 클릭 → 상세 sheet 표시
- 부모: 품목 조회/편집 modal

## 5. ⚠️ 위험 포인트

> [!warning] item null 체크 → tab reset 필수
> locations/logs API 로드 — error handling

## 6. 수정 전 체크

- [ ] ItemDetailActionForm props 확장 시 state 동기화
- [ ] tab 전환 시 form state 초기화 (정합성)
