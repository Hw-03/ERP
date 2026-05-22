---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy\_components\_history_sections/TransactionEditUnifiedModal.tsx
tags: [vault, code-note, frontend, b-tier]
---

# TransactionEditUnifiedModal — 거래 정정 통합 모달

> [!summary] 역할
> 거래 정보(메타) 수정 + 수량 보정을 한 화면에서. PIN 작업자 확인.

## 1. 이 파일의 역할

TransactionEditModal과 QuantityCorrectModal 흡수. metaEdit/quantityCorrect 2개 백엔드 엔드포인트 중 변경 영역만 호출. QUANTITY_CORRECTABLE_TYPES(RECEIVE/SHIP)는 직접 수량 보정, 그 외는 ADJUST 거래 생성. PIN은 작업자 식별용(보안 인증 아님).

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_history_sections/TransactionEditUnifiedModal.tsx` ([[erp/frontend/app/legacy\_components\_history_sections/TransactionEditUnifiedModal.tsx|원본]])

## 3. 주요 import

- React: `useEffect`, `useRef`, `useState`
- `api`, `Employee`, `TransactionLog`, `TransactionType` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `formatQty` from `@/lib/mes/format`
- `useFocusTrap` from `@/lib/mes/useFocusTrap`
- `AppSelect` from `../common/AppSelect`
- `useCurrentOperator` hook

## 4. 어디서 쓰이는지

- HistoryDetailPanel에서 거래 편집 모달
- 부모: 거래 상세 view

## 5. ⚠️ 위험 포인트

> [!warning] QUANTITY_CORRECTABLE_TYPES 한정 — 추가 시 로직 재검토
> PIN 검증 실패 시 에러 상태 초기화 필요

## 6. 수정 전 체크

- [ ] canMetaEdit/canQtyCorrect 권한 검증
- [ ] onMetaSuccess/onQtySuccess 콜백 인자 일치 확인
