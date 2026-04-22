"""ERP 코드 체계 개편을 위한 DB 마이그레이션 스크립트.

변경 내용:
  1. items 테이블에 model_symbol 컬럼 추가
  2. item_models 조인 테이블 생성
  3. product_symbols 데이터 업데이트 (새 기호 매핑 적용)
  4. process_types 에 NA 추가

실행: python scripts/migrate_erp_schema.py
"""

import sqlite3
import sys
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "backend" / "erp.db"


def run():
    if not DB_PATH.exists():
        print(f"[오류] DB 파일을 찾을 수 없습니다: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print("=== ERP 스키마 마이그레이션 시작 ===")

    # 1. items 테이블에 model_symbol 컬럼 추가
    existing_cols = {row[1] for row in cur.execute("PRAGMA table_info(items)").fetchall()}
    if "model_symbol" not in existing_cols:
        cur.execute("ALTER TABLE items ADD COLUMN model_symbol TEXT")
        print("[1/4] items.model_symbol 컬럼 추가 완료")
    else:
        print("[1/4] items.model_symbol 이미 존재 — 스킵")

    # 2. item_models 조인 테이블 생성
    cur.execute("""
        CREATE TABLE IF NOT EXISTS item_models (
            item_id TEXT NOT NULL REFERENCES items(item_id) ON DELETE CASCADE,
            slot    INTEGER NOT NULL REFERENCES product_symbols(slot),
            PRIMARY KEY (item_id, slot)
        )
    """)
    print("[2/4] item_models 테이블 생성 완료 (이미 있으면 무시)")

    # 3. product_symbols 데이터 업데이트
    NEW_SYMBOLS = [
        # (slot, symbol, model_name, is_finished_good, is_reserved)
        (1, "3", "DX3000",    False, False),
        (2, "7", "COCOON",    False, False),
        (3, "8", "SOLO",      False, False),
        (4, "4", "ADX4000W",  False, False),
        (5, "6", "ADX6000FB", False, False),
    ]
    for slot, sym, model, is_fg, is_res in NEW_SYMBOLS:
        exists = cur.execute(
            "SELECT slot FROM product_symbols WHERE slot = ?", (slot,)
        ).fetchone()
        if exists:
            cur.execute(
                "UPDATE product_symbols SET symbol=?, model_name=?, is_finished_good=?, is_reserved=? WHERE slot=?",
                (sym, model, 1 if is_fg else 0, 1 if is_res else 0, slot),
            )
        else:
            cur.execute(
                "INSERT INTO product_symbols (slot, symbol, model_name, is_finished_good, is_reserved) VALUES (?,?,?,?,?)",
                (slot, sym, model, 1 if is_fg else 0, 1 if is_res else 0),
            )
    print("[3/4] product_symbols 업데이트 완료 (슬롯 1~5)")

    # 4. process_types 에 NA 추가
    na_exists = cur.execute(
        "SELECT code FROM process_types WHERE code = 'NA'"
    ).fetchone()
    if not na_exists:
        cur.execute(
            "INSERT INTO process_types (code, prefix, suffix, stage_order, description) VALUES (?,?,?,?,?)",
            ("NA", "N", "A", 6, "튜닝 어셈블리 - 발생부 출력값 조정/최적화 결과물"),
        )
        print("[4/4] process_types.NA 추가 완료")
    else:
        # description 업데이트
        cur.execute(
            "UPDATE process_types SET description=? WHERE code='NA'",
            ("튜닝 어셈블리 - 발생부 출력값 조정/최적화 결과물",),
        )
        print("[4/4] process_types.NA 이미 존재 - description 갱신")

    conn.commit()
    conn.close()
    print("\n=== 마이그레이션 완료 ===")
    print("다음 단계: python scripts/reapply_erp_codes.py --dry-run")


if __name__ == "__main__":
    run()
