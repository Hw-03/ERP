# test_generated_mes_code.py

## 이 파일은 뭐예요?
`items.mes_code`가 SQLite 생성열(generated column)로 올바르게 동작하는지 검증하는 단위 테스트. 자동 계산, 변경 시 재계산, 직접 쓰기 거부를 확인한다.

## 검증하는 것
- 품목 INSERT 시 `mes_code`가 분해 필드(`model_symbol`, `process_type_code`, `serial_no`)로 자동 계산됨
- `serial_no` 변경 → `mes_code` 재계산
- `mes_code`에 직접 값 INSERT 시도 → `OperationalError` 발생(SQLite가 거부)

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — `Item` 모델 (`mes_code` 생성열 정의)
- [[ERP/backend/app/utils/mes_code.py]] — `make_mes_code` 유틸
