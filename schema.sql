-- =============================================================================
-- ERP 자재 마스터 DB 스키마 (PostgreSQL 기준, MySQL/MariaDB 호환 가능)
-- =============================================================================
--
-- 정밀 X-ray 발생 장치 제조사의 자재/BOM/재고 관리를 위한 관계형 스키마.
-- erp_integration.py로 생성한 ERP_Master_DB.csv 를 이 스키마로 적재하는 것을
-- 전제로 설계됨.
--
-- 설계 원칙:
--   1. 자재 마스터(items)는 단일 진실의 원천 (Single Source of Truth)
--   2. BOM(자재 명세서)은 별도 테이블(bom_headers / bom_lines)로 분리
--   3. 재고 스냅샷(stock_snapshots)은 월별 이력 관리
--   4. 소스 추적(item_source_links)으로 엑셀 원본에서 어느 행에서 왔는지 기록
--   5. 모든 PK는 surrogate key(자동 증가) + 비즈니스 키는 UNIQUE 제약
--
-- 카테고리 코드 (category_code):
--   RM : Raw Material        - 원자재
--   BA : Body Assembly Sub   - 조립 반제품
--   BF : Body Assembly Final - 조립 완제품
--   HA : High-voltage Sub    - 고압 반제품
--   HF : High-voltage Final  - 고압 완제품
--   VA : Vacuum Sub          - 진공 반제품
--   VF : Vacuum Final        - 진공 완제품
--   FG : Finished Goods      - 최종 완제품 (고객 출하용)
--
-- =============================================================================

-- 카테고리 Enum ---------------------------------------------------------------
DROP TYPE IF EXISTS category_code_enum CASCADE;
CREATE TYPE category_code_enum AS ENUM (
    'RM', 'BA', 'BF', 'HA', 'HF', 'VA', 'VF', 'FG'
);

-- 매핑 상태 Enum --------------------------------------------------------------
DROP TYPE IF EXISTS mapping_status_enum CASCADE;
CREATE TYPE mapping_status_enum AS ENUM (
    'mapped',     -- 파일 A와 파일 B/C 매핑 완료
    'assy_only',  -- 파일 B 또는 C 단독 (Ass'y/완제품 후보)
    'raw_only'    -- 파일 A 단독 (B/C에서 매칭 실패)
);

-- 부서 Enum -------------------------------------------------------------------
DROP TYPE IF EXISTS department_enum CASCADE;
CREATE TYPE department_enum AS ENUM (
    '조립', '고압', '진공', '튜닝', '출하', '구매', '품질',
    '구버전', '미사용', '사용중'
);

-- -----------------------------------------------------------------------------
-- 1. items : 자재 마스터 (단일 진실의 원천)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS items CASCADE;
CREATE TABLE items (
    item_pk          BIGSERIAL PRIMARY KEY,
    item_id          VARCHAR(12) NOT NULL UNIQUE,  -- 비즈니스 키 (RM-000001 형식)
    category_code    category_code_enum NOT NULL,

    -- 표준화된 품명 정보
    std_name         VARCHAR(200) NOT NULL,
    std_spec         VARCHAR(200),
    std_unit         VARCHAR(20) DEFAULT 'EA',

    -- 원자재 속성 (파일 A 출처)
    part_type        VARCHAR(50),          -- 부품종류 (예: ABS 난연, PCB, CABLE)
    maker            VARCHAR(100),
    maker_pn         VARCHAR(100),
    supplier         VARCHAR(100),

    -- 조직/모델 참조
    department       VARCHAR(20),          -- 관리 부서 (조립/고압/진공/튜닝)
    model_ref        VARCHAR(200),         -- 적용 제품 모델 (콤마 구분)

    -- 재고 스냅샷 (최신 값 - 월별 이력은 stock_snapshots)
    stock_prev       INTEGER,              -- 전월재고
    stock_current    INTEGER,              -- 현재고
    safety_stock     INTEGER,              -- 안전재고
    moq              INTEGER,              -- 최소 주문 수량
    lead_time        VARCHAR(50),          -- 납기

    -- 매핑/추적 메타
    mapping_status   mapping_status_enum NOT NULL DEFAULT 'raw_only',
    original_name_a  VARCHAR(200),         -- 파일 A 원본명
    original_name_bc VARCHAR(200),         -- 파일 B/C 원본명
    notes            TEXT,

    -- 감사(audit) 컬럼
    created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by       VARCHAR(50) DEFAULT 'erp_integration.py',
    is_active        BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_items_category ON items(category_code);
CREATE INDEX idx_items_std_name ON items(std_name);
CREATE INDEX idx_items_maker_pn ON items(maker_pn) WHERE maker_pn IS NOT NULL;
CREATE INDEX idx_items_department ON items(department);
CREATE INDEX idx_items_mapping_status ON items(mapping_status);

COMMENT ON TABLE items IS '자재 마스터 - 원자재/반제품/완제품의 단일 진실의 원천';
COMMENT ON COLUMN items.item_id IS '비즈니스 키. 형식: {category}-{6자리 시퀀스} 예: RM-000001';
COMMENT ON COLUMN items.model_ref IS '적용 제품 모델명 (콤마 구분). BOM 상위 참조 힌트로 사용';


-- -----------------------------------------------------------------------------
-- 2. item_source_links : 엑셀 원본 소스 추적
-- -----------------------------------------------------------------------------
-- 한 마스터 아이템이 여러 엑셀 파일에서 온 경우 M:N 관계를 기록.
-- 예: 같은 원자재가 파일 A와 파일 C에 모두 존재하면 2개 링크 row 생성.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS item_source_links CASCADE;
CREATE TABLE item_source_links (
    link_pk        BIGSERIAL PRIMARY KEY,
    item_pk        BIGINT NOT NULL REFERENCES items(item_pk) ON DELETE CASCADE,
    source_file    VARCHAR(10) NOT NULL,   -- 'A' / 'B' / 'C'
    source_sheet   VARCHAR(50) NOT NULL,
    source_row     INTEGER NOT NULL,
    original_name  VARCHAR(200) NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_source_link UNIQUE (item_pk, source_file, source_sheet, source_row)
);

CREATE INDEX idx_links_item ON item_source_links(item_pk);
CREATE INDEX idx_links_source ON item_source_links(source_file, source_sheet);

COMMENT ON TABLE item_source_links IS '마스터 아이템이 유래한 엑셀 원본 행 추적';


-- -----------------------------------------------------------------------------
-- 3. product_models : 회사 제품 모델 마스터
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS product_models CASCADE;
CREATE TABLE product_models (
    model_pk      BIGSERIAL PRIMARY KEY,
    model_code    VARCHAR(50) NOT NULL UNIQUE,    -- 예: DX3000, ADX6000, COCOON
    model_name    VARCHAR(100),                    -- 한글명 / 마케팅 이름
    model_family  VARCHAR(50),                     -- 예: 수의용/의료용
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE product_models IS '회사 제품 모델 마스터 (DX3000, ADX6000, SOLO, COCOON, 330N 등)';


-- -----------------------------------------------------------------------------
-- 4. bom_headers + bom_lines : BOM (자재 명세서)
-- -----------------------------------------------------------------------------
-- 원자재(RM) → 반제품(HA/VA/BA) → 완제품(FG)의 계층 구조.
-- bom_headers: 한 제품/반제품의 BOM "버전"을 정의
-- bom_lines:   해당 BOM의 구성 라인 (부품 + 수량)
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS bom_lines CASCADE;
DROP TABLE IF EXISTS bom_headers CASCADE;

CREATE TABLE bom_headers (
    bom_pk          BIGSERIAL PRIMARY KEY,
    parent_item_pk  BIGINT NOT NULL REFERENCES items(item_pk),
    version         VARCHAR(20) NOT NULL DEFAULT '1.0',
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_to        DATE,                    -- NULL = 현재 유효
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      VARCHAR(50),

    CONSTRAINT uq_bom_version UNIQUE (parent_item_pk, version)
);

CREATE INDEX idx_bom_parent ON bom_headers(parent_item_pk);

CREATE TABLE bom_lines (
    line_pk         BIGSERIAL PRIMARY KEY,
    bom_pk          BIGINT NOT NULL REFERENCES bom_headers(bom_pk) ON DELETE CASCADE,
    seq             INTEGER NOT NULL,        -- 라인 순번
    child_item_pk   BIGINT NOT NULL REFERENCES items(item_pk),
    quantity        NUMERIC(12, 4) NOT NULL DEFAULT 1,
    unit            VARCHAR(20) DEFAULT 'EA',
    scrap_rate      NUMERIC(5, 4) DEFAULT 0, -- 스크랩률 (0.0000 ~ 1.0000)
    notes           TEXT,

    CONSTRAINT uq_bom_line UNIQUE (bom_pk, seq)
);

CREATE INDEX idx_bom_lines_bom ON bom_lines(bom_pk);
CREATE INDEX idx_bom_lines_child ON bom_lines(child_item_pk);

COMMENT ON TABLE bom_headers IS 'BOM 헤더 - 제품/반제품의 자재 명세서 버전 관리';
COMMENT ON TABLE bom_lines IS 'BOM 라인 - 각 구성 부품과 소요량';


-- -----------------------------------------------------------------------------
-- 5. stock_snapshots : 월별 재고 스냅샷 이력
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS stock_snapshots CASCADE;
CREATE TABLE stock_snapshots (
    snap_pk         BIGSERIAL PRIMARY KEY,
    item_pk         BIGINT NOT NULL REFERENCES items(item_pk) ON DELETE CASCADE,
    snap_date       DATE NOT NULL,           -- 스냅샷 기준 일자 (월말 권장)
    stock_qty       INTEGER NOT NULL DEFAULT 0,
    inbound_qty     INTEGER NOT NULL DEFAULT 0,   -- 당월 입고
    outbound_qty    INTEGER NOT NULL DEFAULT 0,   -- 당월 출고/소모
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_stock_snap UNIQUE (item_pk, snap_date)
);

CREATE INDEX idx_stock_item_date ON stock_snapshots(item_pk, snap_date DESC);
CREATE INDEX idx_stock_date ON stock_snapshots(snap_date);

COMMENT ON TABLE stock_snapshots IS '월별 재고 스냅샷 이력 (매월 말 기준 인벤토리 동결)';


-- -----------------------------------------------------------------------------
-- 6. 뷰: 현재 유효 BOM (v_current_bom)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_current_bom AS
SELECT
    h.bom_pk,
    h.parent_item_pk,
    pi.item_id       AS parent_item_id,
    pi.std_name      AS parent_name,
    pi.category_code AS parent_category,
    l.seq,
    l.child_item_pk,
    ci.item_id       AS child_item_id,
    ci.std_name      AS child_name,
    ci.category_code AS child_category,
    l.quantity,
    l.unit,
    l.scrap_rate,
    h.version,
    h.valid_from
FROM bom_headers h
JOIN bom_lines l   ON l.bom_pk = h.bom_pk
JOIN items pi      ON pi.item_pk = h.parent_item_pk
JOIN items ci      ON ci.item_pk = l.child_item_pk
WHERE h.valid_to IS NULL OR h.valid_to >= CURRENT_DATE;

COMMENT ON VIEW v_current_bom IS '현재 유효한 BOM 조회용 뷰 (valid_to가 NULL이거나 미래인 항목)';


-- -----------------------------------------------------------------------------
-- 7. 뷰: 카테고리별 재고 요약
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_stock_summary_by_category AS
SELECT
    category_code,
    COUNT(*)                           AS item_count,
    COALESCE(SUM(stock_current), 0)    AS total_current_stock,
    COALESCE(SUM(stock_prev), 0)       AS total_prev_stock,
    COUNT(*) FILTER (WHERE stock_current IS NULL OR stock_current = 0) AS zero_stock_count,
    COUNT(*) FILTER (WHERE stock_current < safety_stock) AS below_safety_count
FROM items
WHERE is_active = TRUE
GROUP BY category_code
ORDER BY category_code;

COMMENT ON VIEW v_stock_summary_by_category IS '카테고리별 재고 및 안전재고 미달 항목 요약';


-- -----------------------------------------------------------------------------
-- 8. updated_at 자동 갱신 트리거 (PostgreSQL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_set_updated_at ON items;
CREATE TRIGGER items_set_updated_at
    BEFORE UPDATE ON items
    FOR EACH ROW
    EXECUTE FUNCTION trg_set_updated_at();


-- =============================================================================
-- 데이터 적재 가이드 (CSV → 테이블)
-- =============================================================================
--
-- psql 예시:
--
--   \COPY items (item_id, category_code, std_name, std_spec, std_unit,
--                part_type, maker, maker_pn, supplier, department, model_ref,
--                stock_prev, stock_current, safety_stock, moq, lead_time,
--                original_name_a, original_name_bc, mapping_status, notes,
--                created_at)
--   FROM 'ERP_Master_DB.csv' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');
--
--   -- item_source_links 는 item_pk가 필요하므로 staging 테이블 경유 적재 권장:
--   CREATE TEMP TABLE stg_links (
--       item_id      VARCHAR(12),
--       source_file  VARCHAR(10),
--       source_sheet VARCHAR(50),
--       source_row   INTEGER,
--       original_name VARCHAR(200)
--   );
--   \COPY stg_links FROM 'ERP_Source_Links.csv' WITH (FORMAT csv, HEADER true);
--
--   INSERT INTO item_source_links (item_pk, source_file, source_sheet, source_row, original_name)
--   SELECT i.item_pk, s.source_file, s.source_sheet, s.source_row, s.original_name
--   FROM stg_links s JOIN items i ON i.item_id = s.item_id;
--
-- =============================================================================
