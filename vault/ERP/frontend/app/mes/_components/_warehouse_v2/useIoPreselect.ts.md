# useIoPreselect.ts

## 이 파일은 뭐예요?
대시보드 등 외부에서 품목을 미리 선택해 위저드로 진입할 때, 해당 품목을 자동으로 카트에 추가하거나 피커 행을 강조하는 effect를 담은 훅입니다. BOM 부모이면 자동 추가 없이 행 하이라이트만, 일반 품목이면 `addItem` 자동 호출합니다.

## 언제 보나요?
- 대시보드 "빠른작업"에서 특정 품목을 선택해 위저드를 열 때
- process workType + 방향 미선택 상태에서 자동 적용이 보류되는 동작을 확인할 때
- BOM 데이터 로딩 race 조건(bomParentsLoaded 가드)을 점검할 때

## 중요한 내용
- `useIoPreselect(args)` — void 반환. effect만 수행
- `bomParentsLoaded: boolean` — false이면 어떤 분기도 실행 안 함 (S1 race 대응)
- `handledRef` — workType/subType/부서 4필드 조합으로 같은 품목이라도 상태 변경 시 재적용
- BOM 부모이면 `setHighlightItemId(item_id)`, 그 외이면 `addItem(item)` 호출

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — 이 훅에 `addItem` / `setHighlightItemId`를 주입하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoTargetPicker.tsx]] — `highlightItemId`를 받아 행을 flash 강조하는 피커
