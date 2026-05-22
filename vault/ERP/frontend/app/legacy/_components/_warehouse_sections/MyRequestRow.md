---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components\_warehouse_sections/MyRequestRow.tsx
tags: [vault, code-note, frontend, b-tier]
---

# MyRequestRow — 내 요청 목록 행

> [!summary] 역할
> StockRequest 하나의 상태·메타·액션 표시. 상태별 색상·레이블.

## 1. 이 파일의 역할

내 요청 패널에서 각 StockRequest 카드 렌더. 상태(draft/submitted/completed 등)별 색상·레이블 매핑. 상대 시간(formatRelative)으로 생성 시점 표시. 부서명 정규화, 총 수량 합계.

## 2. 실제 원본 위치

`erp/frontend/app/legacy\_components\_warehouse_sections/MyRequestRow.tsx` ([[erp/frontend/app/legacy\_components\_warehouse_sections/MyRequestRow.tsx|원본]])

## 3. 주요 import

- `StockRequest` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `normalizeDepartment` from `@/lib/mes/department`
- `formatQty` from `@/lib/mes/format`
- `REQUEST_TYPE_LABEL` from `./ioRequestLabels`

## 4. 어디서 쓰이는지

- MyRequestsPanel 반복 렌더
- 부모: 내 요청 목록

## 5. ⚠️ 위험 포인트

> [!warning] STATUS_LABEL/COLOR 상태값 추가 시 일관성 점검 필수

## 6. 수정 전 체크

- [ ] 새 상태값(status) 추가 시 두 레코드 동시 갱신
- [ ] formatRelative 단위 변경(분/시간/일) 검증
