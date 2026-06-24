# test_model_symbol_sync.py

## 이 파일은 뭐예요?
런타임 파생 함수 `slots_to_model_symbol` / `mes_code_to_model_slots`가 `product_symbols` 테이블 마스터(`_PRODUCT_SYMBOL_ASSIGNED` 시드)와 정확히 일치하는지, 캐시 미적재 시 경고를 내는지를 검증하는 단위 테스트.

## 언제 보나요?
- 새 모델(슬롯/기호)이 추가되었을 때 파생 함수 동기화 확인이 필요할 때
- 캐시 로직 변경 후 `invalidate_symbol_cache` / `refresh_symbol_cache` 동작 이상 시
- mes_code 앞자리(모델 기호) 디코딩 버그 의심 시

## 중요한 내용
- `test_runtime_derivation_matches_master`: 시드된 모든 슬롯에 대해 양방향(slot→symbol, symbol→slot) 일치 확인. 다중 모델 prefix(예: `"34678-PR-0001"`) 분해도 검증
- `test_empty_cache_returns_empty_and_warns`: 캐시 미적재 상태에서 `slots_to_model_symbol` 호출 → 빈 문자열 반환 + 경고 로그 1회
- `test_loaded_cache_no_warning`: 정상 캐시 상태에서 경고 없이 결과 반환

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/utils/mes_code.py]] — `slots_to_model_symbol`, `mes_code_to_model_slots`, `refresh_symbol_cache`, `invalidate_symbol_cache`
- [[ERP/backend/bootstrap/seed.py]] — `_PRODUCT_SYMBOL_ASSIGNED` 시드 데이터
