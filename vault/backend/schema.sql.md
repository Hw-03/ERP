---
type: code-note
project: ERP
layer: infra
source_path: schema.sql
status: active
tags:
  - erp
  - infra
  - database
  - schema
  - sql
aliases:
  - SQL 스키마
---

# schema.sql

> [!summary] 역할
> 향후 **PostgreSQL 기반 ERP 이관**을 위한 완전한 관계형 DB 스키마.
> 현재 운영 중인 SQLite(`erp.db`)와는 별개로, 장기적인 SQL DB 전환을 준비하는 설계 문서다.

> [!info] 설계 원칙
> 1. 자재 마스터(`items`)가 **단일 진실의 원천 (Single Source of Truth)**
> 2. BOM은 `bom_headers` / `bom_lines` 로 분리
> 3. 재고 스냅샷은 `stock_snapshots` 로 월별 이력 관리
> 4. 소스 추적(`item_source_links`)으로 엑셀 원본 행 기록
> 5. 모든 PK는 surrogate key (자동 증가) + 비즈니스 키는 UNIQUE 제약

> [!info] 주요 테이블
> | 테이블 | 설명 |
> |--------|------|
> | `items` | 자재 마스터 (단일 진실 원천) |
> | `bom_headers` | BOM 헤더 (상위 품목) |
> | `bom_lines` | BOM 라인 (하위 품목 + 수량) |
> | `stock_snapshots` | 월별 재고 스냅샷 |
> | `item_source_links` | 엑셀 원본 행 → 품목 매핑 |

> [!info] 포함 Enum 타입
> - `category_code_enum`: RM, BA, BF, HA, HF, VA, VF, TA, TF, FG
> - `mapping_status_enum`: mapped, assy_only, raw_only
> - `department_enum`: 조립, 고압, 진공, 튜닝, 출하, 구매, 품질 등

> [!warning] 주의
> 현재 실제 운영은 **SQLite + SQLAlchemy ORM**(`backend/app/models.py`)으로 이루어진다.
> 이 파일은 PostgreSQL 이관용 참조 스키마이며, 현재 앱과 완전히 동일하지 않을 수 있다.

---

## 쉬운 말로 설명

**"PostgreSQL 로 이관할 때 쓰려고 만들어둔 설계 청사진"**. 현재 실제 운영은 SQLite + SQLAlchemy ORM 이지만, 규모 커지면 Postgres 로 가기 위한 참고 파일.

현재 코드와 100% 일치하지 않음. 이관 시 `models.py` 를 기준으로 다시 맞춰야 할 가능성.

## `items.py` (models.py) 와의 차이 예

- `schema.sql` 은 `CHECK` 제약 + ENUM 타입 풍부
- `models.py` 는 SQLAlchemy 제약 중 일부만 생성 (SQLite 호환성)
- `stock_snapshots` 는 `schema.sql` 에만 정의 (월별 스냅샷 테이블, 미구현)
- 소스 추적 테이블 `item_source_links` 도 `schema.sql` 에만

## FAQ

**Q. 이 파일을 현재 DB 에 실행 가능?**
실패. SQLite 문법 아님 + 테이블 구조 다름. `models.py` 의 `Base.metadata.create_all()` 이 실제 스키마.

**Q. 이관 계획 있음?**
당장은 없음. 프로토타입 단계. SQLite WAL 모드로 충분.

---

## 관련 문서

- [[backend/app/models.py.md]] — 현재 운영 중인 SQLAlchemy 모델
- [[backend/app/database.py.md]] — SQLite 연결 설정
- [[scripts/migrate_erp_schema.py.md]] — DB 스키마 마이그레이션 스크립트

Up: ERP MOC
