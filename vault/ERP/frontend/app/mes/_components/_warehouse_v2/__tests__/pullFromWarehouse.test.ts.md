# pullFromWarehouse.test.ts

## 이 파일은 뭐예요?
`pullFromWarehouse.ts`의 `shortageLines`·`collectShortageItemIds` 두 함수를 검증하는 단위 테스트. 번들 목록에서 재고 부족 라인을 수집하고 item_id를 dedupe하는 로직을 확인한다.

## 언제 보나요?
- "창고에서 가져오기" 기능(부족 재고 자동 선택 로직) 수정 시
- `pullFromWarehouse.ts`의 `collectShortageItemIds` 선택 필터링(선택 없으면 전체, 선택 있으면 교집합) 동작 확인 시

## 중요한 내용
- `shortageLines(bundles)`: `included=true && shortage>0`인 라인만 반환
- `collectShortageItemIds(bundles)`: 선택 Set 없으면 부족 라인 전체 item_id, 있으면 선택된 것만
- 동일 item_id는 여러 번들에 걸쳐 dedupe됨
- `included=false` 또는 `shortage=0`인 라인은 결과에서 제외

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/app/mes/_components/_warehouse_v2/pullFromWarehouse.ts]] — 테스트 대상 함수 원본
