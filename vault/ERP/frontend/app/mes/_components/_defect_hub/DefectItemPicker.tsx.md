# DefectItemPicker.tsx

## 이 파일은 뭐예요?
불량 격리/폐기 카트 흐름(`DefectCartFlow`)에서 품목을 다중 선택하는 테이블 컴포넌트다. `IoTargetPicker`와 동일한 필터(부서/모델/단계/검색) + 재고표를 `itemPickerShared`로 재사용하되, BOM/낱개 분기 없이 행마다 "추가/담김" 1버튼만 제공한다.

## 언제 보나요?
- `DefectCartFlow` Step 2에서 좌측 피커 영역에 표시될 때
- 직원 커스텀 정렬과 필터가 모두 적용된 품목 테이블을 봐야 할 때

## 중요한 내용
- `Props.selectedIds`: 이미 장바구니에 담긴 item_id Set — "담김/추가" 상태 표시 및 중복 추가 방지
- `Props.onAdd` / `Props.onRemove`: 담기/빼기 콜백
- 필터: 부서(`LabeledSelect`) + 모델 + 단계 + 검색 — 모두 `itemPickerShared` 유틸 사용
- 순서 편집 모드: `useItemOrderDrag` + `useMyItemOrderQuery` + `usePutMyItemOrderMutation` 드래그 정렬 지원 (PC 전용, 모바일 `lg:block`으로 숨김)
- `DefectEditOrderTable` 내부 컴포넌트: 순서 편집 모드용 드래그 테이블

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/itemPickerShared.tsx]] — 필터/정렬 공용 유틸
- [[ERP/frontend/app/mes/_components/_defect_hub/DefectCartFlow.tsx]] — 이 컴포넌트를 사용하는 흐름
- [[ERP/frontend/lib/queries/useMyItemOrderQuery.ts]] — 직원 커스텀 품목 순서 쿼리
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useItemOrderDrag.ts]] — 드래그 정렬 훅
