---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx
tags: [vault, code-note, frontend, b-tier]
---

# DraftCartItemRow — 입출고 draft 카드 행

> [!summary] 역할
> DraftCartPanel의 각 draft 미리보기 카드. 메타 + lines 요약 + 버튼.

## 1. 이 파일의 역할

저장된 draft(StockRequest) 하나를 카드 형태로 표시. 총 수량 합계 계산, 최대 5개 라인 미리보기, "계속" 및 "삭제" 버튼 노출. 부서명 정규화, 요청 타입 레이블 표시.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_sections/DraftCartItemRow.tsx|원본]])

## 3. 주요 import

- `StockRequest` from `@/lib/api`
- `LEGACY_COLORS` from `@/lib/mes/color`
- `normalizeDepartment` from `@/lib/mes/department`
- `formatQty` from `@/lib/mes/format`
- `REQUEST_TYPE_LABEL` from `./ioRequestLabels`

## 4. 어디서 쓰이는지

- DraftCartPanel 반복 렌더
- 부모: 입출고 draft 목록

## 5. ⚠️ 위험 포인트

> [!warning] isBusy 플래그로 버튼 비활성화 — 병렬 액션 방지 필수

## 6. 수정 전 체크

- [ ] draft.lines 구조 변경 시 미리보기 로직 점검
- [ ] REQUEST_TYPE_LABEL 확장 후 렌더 반영
