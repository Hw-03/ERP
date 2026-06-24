# mes_code.py

## 이 파일은 뭐예요?
`{model_symbol}-{process_type}-{serial:04d}` 형식의 mes_code(품목 코드)를 생성·파싱하는 유틸리티입니다. 제품 기호(symbol) 캐시를 프로세스-로컬 메모리에 유지해 데드락 없이 빠르게 슬롯↔기호 변환을 제공합니다.

## 언제 보나요?
- 품목 생성/수정 시 mes_code를 만들어야 할 때 (`make_mes_code`, `next_serial_no`)
- mes_code 문자열로 연결된 모델 슬롯을 역산할 때 (`mes_code_to_model_slots`)
- 심볼 캐시 갱신·무효화 흐름을 추적할 때 (`refresh_symbol_cache`, `invalidate_symbol_cache`)

## 중요한 내용
- `refresh_symbol_cache(db)` — app startup 및 모델 CRUD 직후 호출. 열려 있는 세션(db)을 재사용해 새 커넥션을 열지 않음(데드락 방지).
- `invalidate_symbol_cache()` — 캐시를 None으로 비워 다음 refresh 전까지 빈 맵으로 동작시킴.
- `slots_to_model_symbol(slots)` — 슬롯 목록 → 정렬된 기호 문자열 (예: `[1,4,5]` → `"346"`).
- `mes_code_to_model_slots(mes_code)` — 코드 첫 `-` 앞 prefix 글자 → 슬롯 오름차순 리스트 (예: `"78-PR-0042"` → `[2, 3]`).
- `make_mes_code(model_symbol, process_type, serial_no)` — 세 인자를 합쳐 코드 문자열 반환.
- `next_serial_no(model_symbol, process_type, db)` — process_type 카테고리 전역 최대 serial_no + 1. 모델 무관 전역 유일 보장.
- `_slot_symbol_cache` — 모듈 전역 캐시(dict). 미적재 시 빈 맵으로 조용히 동작(요청 중 DB 재적재 안 함).

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — `ProductSymbol`, `Item` 모델 정의
- [[ERP/backend/app/routers/📁_routers]] — 모델 CRUD 라우터에서 `refresh_symbol_cache` / `invalidate_symbol_cache` 호출
- [[ERP/_attic/docs/ITEM_CODE_RULES.md]] — mes_code 18개 process_type 규칙 전체 명세
