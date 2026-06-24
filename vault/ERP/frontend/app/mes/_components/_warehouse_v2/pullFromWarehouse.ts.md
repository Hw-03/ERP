# pullFromWarehouse.ts

## 이 파일은 뭐예요?
생산(produce) 4단계에서 재고가 부족한 라인을 모아 "창고에서 가져오기" 창고 반출 작업 대상으로 변환하는 순수 함수 모음입니다. UI 없이 단위 테스트 가능하도록 분리되어 있습니다.

## 언제 보나요?
- "창고에서 가져오기" 버튼을 눌렀을 때 어떤 품목이 대상이 되는지 확인할 때
- 부족 라인 선택 세트(pullSelected)가 비었을 때와 선택이 있을 때의 분기를 이해할 때

## 중요한 내용
- `shortageLines(bundles)` — `included && shortage > 0` 라인 배열 반환
- `collectShortageItemIds(bundles, selectedLineIds?)` — 부족 라인의 item_id를 dedupe해 반환. selectedLineIds 비어 있으면 전체 부족 라인 대상

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/IoComposeView.tsx]] — `collectShortageItemIds` 결과로 warehouse_to_dept 새 작업을 초기화하는 최상위 위저드
- [[ERP/frontend/app/mes/_components/_warehouse_v2/__tests__/pullFromWarehouse.test.ts]] — 이 파일의 단위 테스트
