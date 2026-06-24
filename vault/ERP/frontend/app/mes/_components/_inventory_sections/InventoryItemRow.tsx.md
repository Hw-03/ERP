# InventoryItemRow.tsx

## 이 파일은 뭐예요?
재고 테이블의 개별 품목 행(`<tr>`) 컴포넌트입니다. 재고 상태 배지, 썸네일 이미지, 품목명+분포 게이지, 품목 코드, 부서 배지, 현재고, 안전재고를 열로 렌더합니다. `memo`로 감싸 불필요한 리렌더를 방지합니다.

## 언제 보나요?
- `InventoryItemsTable`이 필터링된 품목 목록을 순회하며 각 행을 렌더할 때
- 클릭/Enter/Space 시 `onSelect` 호출 → 우측 상세 패널 열림

## 중요한 내용
- Export: `InventoryItemRow` (memo 래핑된 `InventoryItemRowImpl`)
- Props: `item: Item`, `selected: boolean`, `onSelect: (item: Item | null) => void`, `imageFilename?: string`
- 재고 분포 게이지: 창고(청록) → 부서 정상(부서색) → 부서 불량(빨강) 순 세그먼트
- 선택된 행: 파란 좌측 인셋 바 + 파란 배경 tint
- 이미지 클릭 시 `ImageLightbox` 팝업 (행 클릭과 별도로 `e.stopPropagation`)
- 불량 배지: DEFECTIVE 상태 location이 있으면 빨간 `[불량]` 배지 추가
- 재고 상태: `getStockState()` → 품절(XCircle)/부족(AlertTriangle)/정상(CheckCircle2) 아이콘+색

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryItemsTable.tsx]] — 이 행을 사용하는 테이블
- [[ERP/frontend/lib/mes/inventory.ts]] — `getStockState` 함수
- [[ERP/frontend/lib/mes/colorUtils.ts]] — `tint` 함수
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — `useDeptColorLookup`
