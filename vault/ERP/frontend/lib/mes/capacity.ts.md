# capacity.ts

## 이 파일은 뭐예요?
백엔드에서 받은 AF(조립 완제품) 단위 생산 가능 수량 데이터를 model_symbol 기준으로 묶고 3수량(출하준비/빠른조립/총생산)을 합산하는 집계 헬퍼입니다. 패널 칩과 상세 모달이 이 함수를 공유합니다.

## 언제 보나요?
- 생산 가능 수량 화면에서 모델별 칩이나 그룹 헤더 합계를 렌더링할 때
- 특정 PF에 핀이 꽂혀 있을 때 해당 PF의 3수량만 꺼내야 할 때

## 중요한 내용
- `ModelCapacityGroup` — 그룹화 결과 인터페이스: `key`(model_symbol), `label`(표시명), `items`(AF 항목 배열, ship_ready 내림차순), `totals`(3수량 합산)
- `groupAfByModel(items)` — AF 항목을 model_symbol 단위로 묶고 숫자 오름차순 정렬. 빈 model_symbol은 `"미분류"` 키로 변환되어 항상 목록 끝에 위치
- `getPinnedPfNumbers(modelKey, pfPins, af)` — pfPins에 핀이 지정된 PF의 3수량 반환. 핀 없거나 variant 못 찾으면 `null`

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/model-labels.ts]] — `getModelLabel` import해 그룹 레이블 생성에 사용
- [[ERP/frontend/lib/api/types/production.ts]] — `ProductionCapacityAfBlock`, `ProductionCapacityAfItem` 타입 출처
