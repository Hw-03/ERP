"""직원 서버(C:\\ERP-dev)의 입출고 실적을 개발 서버(C:\\ERP)로 이식한다.

직원 DB는 PRAGMA query_only 로 읽기 전용 강제 — 절대 쓰지 않는다.
재실행해도 안전하도록 이미 존재하는 PK는 건너뛴다 (idempotent).

실행 전 확인한 FK 의존 순서: employees -> items -> inventory ->
io_batches -> io_bundles -> io_lines -> stock_requests ->
stock_request_lines -> transaction_logs.

테스트 품목(3-PF-0029/3-PA-0034, item_name literally "test") 및 관련
transaction_logs 8건은 샘플 데이터라 제외. shipping_requests 는 범위
밖(dev 자체 데이터 유지)이라 옮기지 않고, 이를 참조하는
transaction_logs.shipping_request_id 만 NULL 처리한다.
"""
import shutil
import sqlite3
from datetime import datetime

DEV_DB = r"C:\ERP\backend\mes.db"
EMP_DB = r"C:\ERP-dev\backend\mes.db"

EXCLUDED_TEST_ITEM_IDS = {
    "28574a4aa2364bb9b6a2a65e48b34247",  # 3-PF-0029 (emp 쪽 사본, item_name='테스트')
    "f68106b62e6b400fb5ebda3c9f031e6d",  # 3-PA-0034 (emp 쪽 사본, item_name='test')
}


def backup_dev_db() -> str:
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = f"{DEV_DB}.backup-{ts}"
    shutil.copy2(DEV_DB, backup_path)
    print(f"[backup] {backup_path}")
    return backup_path


def copy_missing_rows(dev, emp, table, pk_col, exclude_pks=frozenset()):
    cols = [r[1] for r in dev.execute(f"PRAGMA table_info({table})").fetchall()]
    pk_idx = cols.index(pk_col)
    dev_pks = {r[0] for r in dev.execute(f"SELECT {pk_col} FROM {table}").fetchall()}

    col_list = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    emp_rows = emp.execute(f"SELECT {col_list} FROM {table}").fetchall()

    to_insert = [
        row for row in emp_rows
        if row[pk_idx] not in dev_pks and row[pk_idx] not in exclude_pks
    ]
    if to_insert:
        dev.executemany(
            f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})",
            to_insert,
        )
    print(f"[{table}] +{len(to_insert)}건 (emp 총 {len(emp_rows)}건)")
    return len(to_insert)


def sync_inventory_quantities(dev, emp) -> int:
    rows = emp.execute(
        "SELECT item_id, quantity, warehouse_qty, pending_quantity FROM inventory"
    ).fetchall()
    updated = 0
    for item_id, qty, wh_qty, pending in rows:
        if item_id in EXCLUDED_TEST_ITEM_IDS:
            continue
        cur = dev.execute(
            "UPDATE inventory SET quantity = ?, warehouse_qty = ?, pending_quantity = ? "
            "WHERE item_id = ?",
            (qty, wh_qty, pending, item_id),
        )
        updated += cur.rowcount
    print(f"[inventory] 수량 갱신 {updated}건")
    return updated


def copy_transaction_logs(dev, emp) -> int:
    cols = [r[1] for r in dev.execute("PRAGMA table_info(transaction_logs)").fetchall()]
    pk_idx = cols.index("log_id")
    item_idx = cols.index("item_id")
    ship_idx = cols.index("shipping_request_id")

    dev_log_ids = {r[0] for r in dev.execute("SELECT log_id FROM transaction_logs").fetchall()}
    dev_shipping_ids = {r[0] for r in dev.execute("SELECT request_id FROM shipping_requests").fetchall()}

    col_list = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    emp_rows = emp.execute(f"SELECT {col_list} FROM transaction_logs").fetchall()

    to_insert = []
    nulled_ship = 0
    for row in emp_rows:
        if row[pk_idx] in dev_log_ids or row[item_idx] in EXCLUDED_TEST_ITEM_IDS:
            continue
        row = list(row)
        if row[ship_idx] and row[ship_idx] not in dev_shipping_ids:
            row[ship_idx] = None
            nulled_ship += 1
        to_insert.append(tuple(row))

    if to_insert:
        dev.executemany(
            f"INSERT INTO transaction_logs ({col_list}) VALUES ({placeholders})",
            to_insert,
        )
    print(f"[transaction_logs] +{len(to_insert)}건 (shipping_request_id NULL 처리 {nulled_ship}건)")
    return len(to_insert)


def main():
    backup_dev_db()

    dev = sqlite3.connect(DEV_DB, timeout=30)
    emp = sqlite3.connect(f"file:{EMP_DB}?mode=ro", uri=True, timeout=30)
    emp.execute("PRAGMA query_only = TRUE")

    try:
        copy_missing_rows(dev, emp, "employees", "employee_id")
        copy_missing_rows(dev, emp, "items", "item_id", EXCLUDED_TEST_ITEM_IDS)
        copy_missing_rows(dev, emp, "inventory", "item_id", EXCLUDED_TEST_ITEM_IDS)
        sync_inventory_quantities(dev, emp)
        copy_missing_rows(dev, emp, "io_batches", "batch_id")
        copy_missing_rows(dev, emp, "io_bundles", "bundle_id")
        copy_missing_rows(dev, emp, "io_lines", "line_id")
        copy_missing_rows(dev, emp, "stock_requests", "request_id")
        copy_missing_rows(dev, emp, "stock_request_lines", "line_id")
        copy_transaction_logs(dev, emp)

        dev.commit()
        print("[done] 커밋 완료")
    except Exception:
        dev.rollback()
        raise
    finally:
        dev.close()
        emp.close()


if __name__ == "__main__":
    main()
