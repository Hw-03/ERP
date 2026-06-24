# mes-capacity.test.ts

## 이 파일은 뭐예요?
`groupAfByModel` 함수가 AF 항목 목록을 모델 기호(`model_symbol`)별로 그룹화하고, 3수량(ship_ready·fast_production·total_production) 합산·정렬·미분류 처리를 올바르게 수행하는지 검증하는 단위 테스트입니다.

## 언제 보나요?
- `frontend/lib/mes/capacity.ts`의 `groupAfByModel` 로직이나 `getModelLabel` 매핑을 수정할 때
- 생산 가능 수량 화면에서 모델별 집계가 맞지 않을 때

## 중요한 내용
- 같은 `model_symbol`을 가진 AF 항목의 3수량(ship_ready·fast_production·total_production) 합산 검증
- `getModelLabel` 매핑: `model_symbol: "4"` → `"ADX4000W"`
- `model_symbol: null`인 항목은 `"미분류"` 그룹으로 묶고 항상 끝에 위치
- 모델 키는 숫자 오름차순 정렬
- 그룹 내부 항목은 `ship_ready` 내림차순 정렬
- 빈 입력은 빈 배열 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/frontend/lib/mes/capacity.ts]] — 테스트 대상 `groupAfByModel` 구현체
- [[ERP/frontend/lib/api/types/production.ts]] — `ProductionCapacityAfItem` 타입 정의
