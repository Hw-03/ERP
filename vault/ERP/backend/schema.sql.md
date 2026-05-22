---
type: code-note
project: ERP
layer: backend
source_path: erp/backend/schema.sql
status: active
updated: 2026-04-27
source_sha: c43e9d19d7c7
tags:
  - erp
  - backend
  - source-file
  - sql
---

# schema.sql

> [!summary] 역할
> 원본 프로젝트의 `schema.sql` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/schema.sql`
- Layer: `backend`
- Kind: `source-file`
- Size: `5342` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````sql
-- =============================================================================
-- DEXCOWIN ERP reference schema
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
    erp_code VARCHAR(50) UNIQUE,
    category_code category_code_enum NOT NULL,
# ... (이하 116줄 생략. 원본 참조)

````
