# 📁 bootstrap

## 이 폴더는 뭐예요?
DB 초기화와 스키마 마이그레이션을 담당하는 패키지. 원래 `bootstrap_db.py` 단일 파일(865줄)에 몰려 있던 4단계 책임을 `init → migrate → seed → backfill` 모듈로 분리했다. `bootstrap_db.py`는 CLI wrapper로만 남아 `python bootstrap_db.py --all` 같은 기존 명령을 그대로 지원한다.

## 언제 여기를 보나요?
- DB 초기화나 스키마 변경 절차를 확인할 때
- 새 컬럼·테이블 마이그레이션을 추가해야 할 때
- 직원·부서·공정 초기 시드 데이터를 수정할 때
- 테스트에서 마이그레이션 관련 심볼을 import할 때

## 주요 파일
- `__init__.py` — 패키지 진입점. `bootstrap_all()`이 4단계를 순서대로 실행하고 각 하위 모듈 심볼을 re-export한다.
- `init.py` — 1단계: `Base.metadata.create_all`로 테이블 생성(이미 존재하면 no-op).
- `migrate.py` — 2단계: `_MIGRATION_DDL` 누적 DDL + 보조 헬퍼로 스키마 변경. 실패·스킵·적용을 3분류해 반환.
- `seed.py` — 3단계: Department·Employee·ProductSymbol·ProcessType·WarehouseAngle 참조 데이터를 테이블이 빈 경우에만 시드.

## 관련 파일
### 먼저 볼 파일
- [[ERP/backend/bootstrap_db.py]] — CLI wrapper; `--all` / `--check` 등 인수를 받아 이 패키지 함수를 호출
- [[ERP/backend/app/database.py]] — `Base`, `engine` 제공
