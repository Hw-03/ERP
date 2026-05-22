---
type: file-explanation
source_path: "backend/schema.sql"
importance: normal
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# schema.sql — schema.sql 설명

## 이 파일은 무엇을 책임지나

`schema.sql`는 SQL 스키마/쿼리입니다. 프로젝트 구조 안에서 `backend/schema.sql` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

자동으로 뽑을 수 있는 함수/클래스 목록은 적지만, 파일 위치와 확장자로 볼 때 위 역할을 맡습니다.

## 연결되는 파일

- [[ERP/backend/📁_backend]] — 이 파일이 속한 폴더의 안내판입니다.

## 핵심 발췌

```sql
-- =============================================================================
-- DEXCOWIN MES reference schema
-- =============================================================================
--
-- This file is a PostgreSQL reference schema for documentation/import planning.
-- The running application uses the SQLAlchemy models under backend/app/models.py.
--
-- Current item/process code rules are documented in docs/ITEM_CODE_RULES.md.
-- Assembly F type is AF. AF is a legacy code and must not be used.
-- =============================================================================

DROP TYPE IF EXISTS category_code_enum CASCADE;
CREATE TYPE category_code_enum AS ENUM (
    'RM', 'AA', 'AF', 'HA', 'HF', 'VA', 'VF', 'TA', 'TF', 'FG', 'UK'
);

DROP TYPE IF EXISTS mapping_status_enum CASCADE;
CREATE TYPE mapping_status_enum AS ENUM (
    'mapped',
    'assy_only',
    'raw_only'
);

DROP TABLE IF EXISTS bom_lines CASCADE;
DROP TABLE IF EXISTS bom_headers CASCADE;
DROP TABLE IF EXISTS stock_snapshots CASCADE;
DROP TABLE IF EXISTS item_source_links CASCADE;
DROP TABLE IF EXISTS product_models CASCADE;
DROP TABLE IF EXISTS items CASCADE;

CREATE TABLE items (
    item_pk BIGSERIAL PRIMARY KEY,
    item_id VARCHAR(36) NOT NULL UNIQUE,
    item_code VARCHAR(50) UNIQUE,
    category_code category_code_enum NOT NULL,
    process_type_code VARCHAR(2),
    symbol_slot INTEGER,
    option_code VARCHAR(2),
    serial_no INTEGER,
    std_name VARCHAR(200) NOT NULL,
    std_spec VARCHAR(200),
    std_unit VARCHAR(20) DEFAULT 'EA',
    part_type VARCHAR(50),
    maker VARCHAR(100),
    maker_pn VARCHAR(100),
    supplier VARCHAR(100),
    department VARCHAR(20),
    model_ref VARCHAR(200),
    min_stock INTEGER,
    mapping_status mapping_status_enum NOT NULL DEFAULT 'raw_only',
    original_name_a VARCHAR(200),
    original_name_bc VARCHAR(200),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
```
