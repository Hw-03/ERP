# seed.py

## 이 파일은 뭐예요?
DB가 처음 비어 있을 때 Department·Employee·ProductSymbol·ProcessType·WarehouseAngle 참조 테이블에 초기 데이터를 한 번만 넣는다. 테이블이 이미 행을 가지면 아무것도 하지 않는 멱등 시드 함수와, 현재 DB 상태를 조회만 하는 `check_db` 함수를 포함한다.

## 언제 보나요?
- 직원 목록·부서·공정 타입 초기 데이터를 바꿔야 할 때
- 창고 앵글 기본 배치(개수·좌표)를 수정할 때
- `python bootstrap_db.py --all` 실행 시 시드가 왜 스킵되는지 확인할 때
- 새 모델(제품 기호)을 시드에 추가해야 할 때

## 중요한 내용
- `seed_reference_data() -> dict[str, int]` — 5개 테이블(부서·직원·ProductSymbol·ProcessType·WarehouseAngle) 각각 `count() == 0`일 때만 INSERT. 반환값은 각 테이블별 삽입 건수.
- `backfill_mes_codes() -> int` — `mes_code`가 생성열로 전환된 후 no-op. 항상 0 반환(하위호환 시그니처 유지).
- `check_db() -> dict` — 쓰기 없이 현재 상태 리포트(직원/공정타입/모델/품목/mes_code 누락 건수).
- `_EMPLOYEE_SEED` — 직원 26명 데이터(사번·이름·역할·부서·레벨). 기본 PIN은 `DEFAULT_PIN_HASH`(0000).
- `_WAREHOUSE_ANGLE_SEED` — 앵글 9개, 880×300 좌표계 기준 배치 위치.
- `_PROCESS_TYPES` — 공정 18종(6부서 × R/A/F). 실사용은 16종.

## 연결되는 파일
### 먼저 볼 파일
- [[ERP/backend/app/models/📁_models]] — 시드 대상 ORM 모델 정의
- [[ERP/backend/app/services/pin_auth.py]] — `DEFAULT_PIN_HASH` (기본 PIN 0000) 제공
- [[ERP/backend/bootstrap/__init__.py]] — `seed_reference_data`와 `backfill_mes_codes`를 re-export하고 호출하는 패키지 진입점
