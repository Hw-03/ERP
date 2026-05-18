"""Add items.bom_completed_at column + backfill all current BOM parents.

멱등(idempotent): 재실행해도 컬럼 중복 추가/중복 backfill 없이 통과한다.
실행 전 반드시 backend/erp.db 백업할 것.
"""
import sqlite3
import sys

sys.stdout.reconfigure(encoding="utf-8")

con = sqlite3.connect(r"backend/erp.db")
cur = con.cursor()

cols = [r[1] for r in cur.execute("PRAGMA table_info(items)")]
if "bom_completed_at" not in cols:
    cur.execute("ALTER TABLE items ADD COLUMN bom_completed_at DATETIME NULL")
    print("column added")
else:
    print("column already exists")

res = cur.execute(
    """
    UPDATE items SET bom_completed_at = CURRENT_TIMESTAMP
    WHERE bom_completed_at IS NULL
      AND item_id IN (SELECT DISTINCT parent_item_id FROM bom)
    """
)
print(f"backfilled {res.rowcount} parents as completed")

con.commit()

completed = cur.execute(
    "SELECT COUNT(*) FROM items WHERE bom_completed_at IS NOT NULL"
).fetchone()[0]
distinct_parents = cur.execute(
    "SELECT COUNT(DISTINCT parent_item_id) FROM bom"
).fetchone()[0]
print(f"final: {completed} items completed (distinct bom parents = {distinct_parents})")
if completed != distinct_parents:
    print("WARNING: completed count != distinct bom parents — 확인 필요")

con.close()
