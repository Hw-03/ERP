---
type: code-note
project: DEXCOWIN MES
layer: frontend
status: active
created: 2026-05-21
updated: 2026-05-21
source_path: erp/frontend/app/legacy/_components/_warehouse_v2/IoBundleCard.tsx
tags: [vault, code-note, frontend, b-tier]
---

# IoBundleCard — IO 번들 상품 카드

> [!summary] 역할
> BOM 또는 수동 구성 품목 묶음을 표시하고, 라인별 수량 및 삭제 관리.

## 1. 이 파일의 역할

입출고 작업 중 하나의 번들(품목 그룹)을 카드 형태로 렌더링. 단일 라인은 직접 IoLineRow 노출, 다중 라인은 collapsible 헤더와 함께 표시. 각 라인 선택/수량 변경/삭제 등 상태 관리를 부모에 위임.

## 2. 실제 원본 위치

`erp/frontend/app/legacy/_components/_warehouse_v2/IoBundleCard.tsx` ([[erp/frontend/app/legacy/_components/_warehouse_v2/IoBundleCard.tsx|원본]])

## 3. 주요 import

- `useState` from react
- `IoBundle`, `IoLine`, `IoSubType`, `Item` from `./types`
- `IoLineRow`, `isOutgoing`, `expectedAfter` from `./IoLineRow`
- `LEGACY_COLORS`, `tint` from `@/lib/mes/color[Utils]`
- `formatQty` from `@/lib/mes/format`
- Icons: `ChevronDown`, `ChevronUp`, `Layers`, `Trash2` from lucide-react

## 4. 어디서 쓰이는지

- IoBundleCart 또는 다른 IO 구성 컴포넌트에서 반복 렌더
- IoLineRow 자식 컴포넌트와 협력
- 부모 상태: bundle, itemMap, available quantity 로직 담당

## 5. ⚠️ 위험 포인트

> [!warning] Hook 호출 순서 보장 위해 단일 라인도 초반에 useState 선언 (early return 전)

## 6. 수정 전 체크

- [ ] IoLineRow props 확장 시 IoBundleCard 전달 점검
- [ ] collapsed state와 다중 라인 UI 동기화
- [ ] onRemoveBundle vs onRemoveLine 구분 명확화
