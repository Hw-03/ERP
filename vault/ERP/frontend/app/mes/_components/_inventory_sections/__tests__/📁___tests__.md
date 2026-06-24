# 📁 __tests__

## 이 폴더는 뭐예요?
`_inventory_sections` 컴포넌트들의 단위 테스트 파일 모음입니다. 재고 화면을 구성하는 개별 컴포넌트의 렌더링 동작과 상태 표시 로직을 Vitest + Testing Library로 검증합니다.

## 언제 여기를 보나요?
- 재고 목록 행(`InventoryItemRow`) 등의 표시 로직이 바뀌었을 때 테스트를 확인하거나 추가할 때
- CI에서 테스트가 실패할 때 해당 테스트 파일의 검증 항목을 파악할 때

## 주요 파일
- `InventoryItemRow.defective.test.tsx` — DEFECTIVE(불량) 상태 재고가 게이지 바에 올바르게 렌더링되는지 검증

## 관련 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_inventory_sections/📁__inventory_sections]] — 테스트 대상 컴포넌트들이 있는 상위 폴더
