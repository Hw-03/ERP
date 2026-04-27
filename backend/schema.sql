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
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_items_category ON items(category_code);
CREATE INDEX idx_items_erp_code ON items(erp_code);
CREATE INDEX idx_items_process_type ON items(process_type_code);
CREATE INDEX idx_items_department ON items(department);
CREATE INDEX idx_items_std_name ON items(std_name);

CREATE TABLE item_source_links (
    link_pk BIGSERIAL PRIMARY KEY,
    item_pk BIGINT NOT NULL REFERENCES items(item_pk) ON DELETE CASCADE,
    source_file VARCHAR(10) NOT NULL,
    source_sheet VARCHAR(50) NOT NULL,
    source_row INTEGER NOT NULL,
    original_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_source_link UNIQUE (item_pk, source_file, source_sheet, source_row)
);

CREATE TABLE product_models (
    model_pk BIGSERIAL PRIMARY KEY,
    model_code VARCHAR(50) NOT NULL UNIQUE,
    model_name VARCHAR(100),
    model_family VARCHAR(50),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE stock_snapshots (
    snap_pk BIGSERIAL PRIMARY KEY,
    item_pk BIGINT NOT NULL REFERENCES items(item_pk) ON DELETE CASCADE,
    snap_date DATE NOT NULL,
    stock_qty INTEGER NOT NULL DEFAULT 0,
    inbound_qty INTEGER NOT NULL DEFAULT 0,
    outbound_qty INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_stock_snap UNIQUE (item_pk, snap_date)
);

CREATE TABLE bom_headers (
    bom_pk BIGSERIAL PRIMARY KEY,
    parent_item_pk BIGINT NOT NULL REFERENCES items(item_pk),
    version VARCHAR(20) NOT NULL DEFAULT '1.0',
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(50),
    CONSTRAINT uq_bom_version UNIQUE (parent_item_pk, version)
);

CREATE TABLE bom_lines (
    line_pk BIGSERIAL PRIMARY KEY,
    bom_pk BIGINT NOT NULL REFERENCES bom_headers(bom_pk) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    child_item_pk BIGINT NOT NULL REFERENCES items(item_pk),
    quantity NUMERIC(12, 4) NOT NULL DEFAULT 1,
    unit VARCHAR(20) DEFAULT 'EA',
    scrap_rate NUMERIC(5, 4) DEFAULT 0,
    notes TEXT,
    CONSTRAINT uq_bom_line UNIQUE (bom_pk, seq)
);

CREATE OR REPLACE VIEW v_current_bom AS
SELECT
    h.bom_pk,
    h.parent_item_pk,
    pi.item_id AS parent_item_id,
    pi.std_name AS parent_name,
    pi.category_code AS parent_category,
    l.seq,
    l.child_item_pk,
    ci.item_id AS child_item_id,
    ci.std_name AS child_name,
    ci.category_code AS child_category,
    l.quantity,
    l.unit,
    l.scrap_rate,
    h.version,
    h.valid_from
FROM bom_headers h
JOIN bom_lines l ON l.bom_pk = h.bom_pk
JOIN items pi ON pi.item_pk = h.parent_item_pk
JOIN items ci ON ci.item_pk = l.child_item_pk
WHERE h.valid_to IS NULL OR h.valid_to >= CURRENT_DATE;

CREATE OR REPLACE VIEW v_stock_summary_by_category AS
SELECT
    category_code,
    COUNT(*) AS item_count,
    COUNT(*) FILTER (WHERE min_stock IS NOT NULL) AS min_stock_item_count
FROM items
WHERE is_active = TRUE
GROUP BY category_code
ORDER BY category_code;
