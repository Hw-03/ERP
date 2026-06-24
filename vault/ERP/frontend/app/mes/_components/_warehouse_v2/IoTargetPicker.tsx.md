# IoTargetPicker.tsx

## 이 파일은 뭐예요?
입출고 위저드 Step 3에서 품목을 검색·필터·선택하는 피커 컴포넌트입니다. 부서/모델/단계 드롭다운과 검색창으로 목록을 좁히고, BOM/낱개 버튼으로 카트에 추가합니다. 직원 개인 순서 드래그 편집 모드도 지원합니다.

## 언제 보나요?
- Step 3(대상 선택) 화면에서 품목을 카트에 담을 때
- 대시보드 "빠른작업"으로 BOM 부모 품목 진입 시 해당 행이 flash 강조될 때
- 직원이 "순서 편집" 버튼으로 개인 표시 순서를 드래그 재정렬할 때

## 중요한 내용
- `IoTargetPicker` — 주 export. `highlightItemId` prop으로 특정 행 scrollIntoView + flash
- `ItemTable` — 일반 조회용 5열 테이블. `mode === "bom_or_single"`이면 BOM/낱개 2버튼, 그 외 선택 1버튼
- `EditOrderTable` — 드래그 핸들 전용 테이블. `useItemOrderDrag` 훅으로 순서 변경
- `HighlightableRow` — 강조 row; 마운트 시 scrollIntoView + `.animate-row-flash` 1.5초
- 스크롤 위치 보존: `tableContainerRef + scrollPosRef`로 묶음 추가 시 스크롤 튕김 방지

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/itemPickerShared.tsx]] — 필터/정렬 유틸 소스
- [[ERP/frontend/app/mes/_components/_warehouse_v2/useItemOrderDrag.ts]] — 드래그 재정렬 훅
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — Step 3 컨텐츠로 이 컴포넌트를 배치하는 최상위 위저드
