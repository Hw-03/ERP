# test_generated_mes_code.py

## 이 파일은 뭐예요?
`items.mes_code` 생성열(generated column)이 DB에서 자동 계산되고, 분해 필드(model_symbol / process_type / serial_no) 변경 시 재계산되며, 직접 쓰기 시도는 거부되는지를 검증하는 단위 테스트.

## 언제 보나요?
- mes_code 생성열 동작이 의심스러울 때 (SQLite generated column 로직 확인)
- `serial_no` 변경 후 코드가 갱신되지 않는 버그 의심 시
- `make_mes_code()` 유틸 함수와 DB 계산 결과 일치 여부 확인 시

## 중요한 내용
- `test_mes_code_auto_computed`: 분해 필드 3개 채우면 `"346-AR-0001"` 형태로 자동 생성 확인
- `test_mes_code_recomputed_on_serial_change`: `serial_no` UPDATE 후 `mes_code` 재계산 확인
- `test_direct_mes_code_write_rejected`: `mes_code="FORCED"` 직접 INSERT 시 SQLite `OperationalError` 발생 확인

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/utils/mes_code.py]] — `make_mes_code()` 함수 (계산 로직)
- [[ERP/backend/app/models/📁_models]] — `Item` 모델 및 `mes_code` generated column 정의
