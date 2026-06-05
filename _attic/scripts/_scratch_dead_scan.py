"""2차 DB 잔재 스캔 — 컬럼별 NULL 비율 + 의심 패턴."""
import sqlite3
import sys
import io
from pathlib import Path
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

c = sqlite3.connect(Path(__file__).parent / "backend" / "mes.db")

# 테이블별 rows
tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
print(f"# 테이블 {len(tables)}개")
for t in tables:
    n = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"  {t:30s}  rows={n}")

print()
print("# 컬럼별 NULL 비율 (NULL=100% 또는 NULL>=95% 만 표시)")
for t in tables:
    total = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    if total == 0:
        continue
    for r in c.execute(f"PRAGMA table_info({t})"):
        col, notnull, pk = r[1], r[3], r[5]
        if notnull or pk:  # NOT NULL/PK 는 스킵
            continue
        try:
            n_null = c.execute(f"SELECT COUNT(*) FROM {t} WHERE {col} IS NULL").fetchone()[0]
        except Exception:
            continue
        ratio = n_null / total
        if ratio >= 0.95:
            marker = "★" if ratio == 1.0 else " "
            print(f"  {marker} {t}.{col:30s} NULL {n_null}/{total} ({ratio*100:.0f}%)")

print()
print("# BOOL/단일값 컬럼 (사실상 상수)")
for t in tables:
    total = c.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    if total < 10:
        continue
    for r in c.execute(f"PRAGMA table_info({t})"):
        col, ctype, pk = r[1], r[2], r[5]
        if pk:
            continue
        if 'BOOL' not in ctype.upper() and 'INTEGER' not in ctype.upper() and 'VARCHAR' not in ctype.upper():
            continue
        try:
            distinct = c.execute(f"SELECT COUNT(DISTINCT {col}) FROM {t}").fetchone()[0]
            if distinct <= 1:
                val = c.execute(f"SELECT {col} FROM {t} LIMIT 1").fetchone()[0]
                print(f"  {t}.{col:30s} distinct={distinct}  value={val!r}")
        except Exception:
            pass

print()
print("# system_settings 내용")
for r in c.execute("SELECT * FROM system_settings"):
    print(f"  {r}")

print()
print("# transaction_edit_logs 샘플 (3건)")
for r in c.execute("SELECT edit_id, original_log_id, reason, created_at FROM transaction_edit_logs"):
    print(f"  edit={str(r[0])[:8]}  orig={str(r[1])[:8]}  reason={r[2][:40]!r}  at={r[3]}")

print()
print("# stock_requests 의 두 approval 컬럼 분포")
for col in ("requires_warehouse_approval", "requires_department_approval"):
    rows = c.execute(f"SELECT {col}, COUNT(*) FROM stock_requests GROUP BY {col}").fetchall()
    print(f"  {col}: {rows}")

print()
print("# io_batches.sub_type 분포")
for r in c.execute("SELECT sub_type, COUNT(*) FROM io_batches GROUP BY sub_type"):
    print(f"  {r[0]!r}: {r[1]}")
