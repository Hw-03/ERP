# InventoryItemRow.defective.test.tsx

## 이 파일은 뭐예요?
`InventoryItemRow` 컴포넌트에서 DEFECTIVE(불량) 상태 재고가 게이지 바에 올바르게 표시되는지 검증하는 Vitest 테스트 파일입니다. PR#3에서 추가된 불량 세그먼트 렌더링 로직을 대상으로 합니다.

## 언제 보나요?
- `InventoryItemRow`의 불량 게이지 세그먼트(빨간 띠, `#ef4444`) 관련 버그를 수정하거나 기능을 변경할 때
- DEFECTIVE 수량이 0일 때 세그먼트가 숨겨지는 동작이 제대로 작동하는지 확인할 때

## 중요한 내용
- 검증 케이스 4가지:
  1. PRODUCTION + DEFECTIVE 행 모두 있을 때 aria-label에 `[불량]` 텍스트 포함 여부
  2. DEFECTIVE 세그먼트 배경색이 `#ef4444`(`rgb(239, 68, 68)`)인지
  3. DEFECTIVE 수량이 0이면 불량 세그먼트가 렌더링되지 않음
  4. PRODUCTION만 있는 품목은 기존 동작 유지(불량 세그먼트 없음)
- `next/image`와 `DepartmentsContext`(`useDeptColorLookup`)를 vi.mock으로 대체
- `makeItem()` 헬퍼로 `Item` 객체를 `locations` 배열과 함께 구성

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/InventoryItemRow.tsx]] — 테스트 대상 컴포넌트
- [[ERP/frontend/app/mes/_components/DepartmentsContext.tsx]] — useDeptColorLookup mock 대상
