---
type: code-note
project: ERP
layer: scripts
source_path: scripts/migrate_erp_schema.py
status: active
tags:
  - erp
  - scripts
  - migration
  - database
  - schema
aliases:
  - DB 스키마 마이그레이션
---

# migrate_erp_schema.py

> [!summary] 역할
> ERP 코드 체계 개편에 따른 **SQLite DB 스키마 변경**을 적용하는 마이그레이션 스크립트.

> [!info] 변경 내용
> 1. `items` 테이블에 `model_symbol` 컬럼 추가
> 2. `item_models` 조인 테이블 생성 (품목 ↔ 모델 다대다)
> 3. `product_symbols` 데이터 업데이트 (새 기호 매핑)
> 4. `process_types` 에 `NA` 추가

> [!warning] 주의
> `backend/app/main.py`의 `run_migrations()` 함수가 앱 실행 시 자동으로 ALTER를 처리하므로,
> 이 스크립트는 대규모 스키마 변경이 필요할 때만 수동 실행한다.

## 실행 방법

```bash
python scripts/migrate_erp_schema.py
```

---

## 쉬운 말로 설명

**ERP 코드 체계 업데이트를 DB 에 반영하는 일회성 마이그레이션 스크립트**. 평소에는 `backend/app/main.py` 의 `run_migrations()` 가 앱 시작 시 자동 처리하므로 이 파일은 거의 건드릴 일 없음.

언제 수동 실행:
- 대규모 스키마 변경 (컬럼 대거 추가/제거)
- 자동 마이그레이션 로직 추가 전 수동 반영 필요 시
- 백업된 DB 를 신규 스키마로 변환

## FAQ

**Q. 이걸 안 돌리면?**
앱은 정상 기동(자동 마이그레이션 덕분). 다만 이 스크립트에만 있는 대규모 변경은 빠짐.

**Q. 되돌리기?**
역방향 스크립트 없음. DB 백업 후 실행 권장.

**Q. PostgreSQL 도 지원?**
현재는 SQLite ALTER 문법 위주. Postgres 마이그은 `alembic` 으로 별도 처리 고려.

---

## 관련 문서

- [[backend/app/main.py.md]] — `run_migrations()` 자동 마이그레이션
- [[backend/app/models.py.md]] — 현재 SQLAlchemy 모델 구조
- [[schema.sql.md]] — PostgreSQL 이관용 스키마

Up: [[scripts/scripts]]
