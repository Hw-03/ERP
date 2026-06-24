# test_model_symbol_sync.py

## 이 파일은 뭐예요?
`slots_to_model_symbol`/`mes_code_to_model_slots` 파생 함수가 `product_symbols` 마스터 테이블 시드(`_PRODUCT_SYMBOL_ASSIGNED`)와 양방향으로 일치하는지 검증하는 런타임 파생 테스트. 캐시 미적재/적재 상태의 경고 동작도 확인한다.

## 검증하는 것
- 시드 전체(`_PRODUCT_SYMBOL_ASSIGNED`) 기준 slot↔기호 양방향 일치 (DX3000/COCOON/SOLO/ADX4000W/ADX6000FB + 모델"9")
- 다중 모델 prefix 파싱 (`34678-PR-0001` → slots [1,2,3,4,5] 등)
- 미등록 글자·None·dash 없는 코드 → `[]` 반환
- 캐시 미적재 상태 → 빈 문자열 반환 + 경고 로그 정확히 1회
- 캐시 적재 + 유효 slots → 정상 반환, 경고 없음

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/utils/mes_code.py]] — `slots_to_model_symbol`, `mes_code_to_model_slots`, `refresh_symbol_cache` (테스트 대상)
- [[ERP/backend/bootstrap/seed.py]] — `_PRODUCT_SYMBOL_ASSIGNED` 마스터 데이터
