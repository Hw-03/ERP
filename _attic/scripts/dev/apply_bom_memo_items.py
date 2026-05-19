"""담당자 13항목 메모 → backend/erp.db 일괄 반영.

A) 이름/문구 수정 4건
B) 통합/삭제 2건 (#2 6-AR-0355 삭제 / #9 6-AR-0185 repoint 후 삭제)
C) 신규 19항목 INSERT

- DB는 정본. BOM 부모-자식 연결은 사람이 나중에 워크벤치로(이번 범위 아님).
- 재고·입출고 등 의존행은 테스트 데이터 → 삭제 시 전부 폐기.
- 단일 트랜잭션. 멱등 가드(신규 코드 선존재 시 중단).
- foreign_keys OFF(기본) 상태에서 의존행을 동적으로 전부 수동 정리 후 items 삭제.
"""
import datetime
import shutil
import sqlite3
import sys
import uuid

sys.stdout.reconfigure(encoding="utf-8")

DB = r"backend/erp.db"

# --- A. 이름/문구 수정 (erp_code → 새 이름) ---
RENAMES = {
    "8-VA-0011": "발생부 고압B/D+튜브 최종 작업完 [DXDR-070]",
    "6-AA-0046": "ADX6000FB BODY RIGHT ASS'Y",
    "46-AR-0100": "ADX4000W, ADX6000 16핀 FFC Cable (사파리 공용)",
    "6-AR-0113": "ADX6000 BOTTOM BLOCK",  # #2 생존품, Blcok→BLOCK
}

# --- B. 삭제 대상 (재고·이력 폐기) ---
DELETE_CODES = ["6-AR-0355", "6-AR-0185"]
# #9: 6-AR-0185 를 자식으로 쓰는 BOM 을 46-AR-0100 으로 repoint 후 6-AR-0185 삭제
REPOINT_FROM = "6-AR-0185"
REPOINT_TO = "46-AR-0100"

# --- C. 신규 19항목 (품목명, erp_code, process_type_code, model_symbol) ---
NEW_ITEMS = [
    ("ADX6000 BAT CONNECT BD (Ver 4.0)", "6-AR-0356", "AR", "6"),
    ("COCOON TOP BODY (W)", "7-AR-0357", "AR", "7"),
    ("COCOON CRADLE BODY (W)", "7-AR-0358", "AR", "7"),
    ("COCOON CRADLE BOTTOM (W)", "7-AR-0359", "AR", "7"),
    ('5" LCD TOP COVER', "4-AR-0360", "AR", "4"),
    ('5" LCD BOTTOM COVER', "4-AR-0361", "AR", "4"),
    ('5" LCD BD', "4-AR-0362", "AR", "4"),
    ('5" LCD 판넬', "4-AR-0363", "AR", "4"),
    ('5" LCD BD ASS\'Y', "4-AA-0077", "AA", "4"),
    ("ADX6000 DFI_BD ASS'Y", "6-AA-0078", "AA", "6"),
    ('ADX4000W 60KV 2mA / 15cm White [일본] (5" 적용)', "4-AF-0043", "AF", "4"),
    ("SOLO 70KV, 2mA / 20cm Black [iM3 / 트리거 에이밍 적용]", "8-AF-0044", "AF", "8"),
    ("Podiatry Stand Pole", "6-PR-0182", "PR", "6"),
    ("Podiatry Stand Arm", "6-PR-0183", "PR", "6"),
    ("Podiatry Stand 브라켓", "6-PR-0184", "PR", "6"),
    ("AllMyT For DX3000 ASS'Y", "3-PA-0027", "PA", "3"),
    ("AllMyT For ADX6000 ASS'Y", "6-PA-0028", "PA", "6"),
    ("Chest & Bed For ADX6000 ASS'Y", "6-PA-0029", "PA", "6"),
    ("Podiatry For ADX6000 ASS'Y", "6-PA-0030", "PA", "6"),
]


def discover_item_fks(cur):
    """items.item_id 를 참조하는 (table, column, on_delete) 전부."""
    refs = []
    for (name,) in cur.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall():
        for fk in cur.execute(f'PRAGMA foreign_key_list("{name}")').fetchall():
            # fk = (id, seq, table, from, to, on_update, on_delete, match)
            if fk[2] == "items":
                refs.append((name, fk[3], fk[6]))
    return refs


def purge_item(cur, item_id, fks):
    """item_id 의 모든 의존행 정리(SET NULL FK 는 NULL, 그 외 DELETE) 후 items 삭제."""
    for table, col, on_delete in fks:
        if (on_delete or "").upper() == "SET NULL":
            cur.execute(f'UPDATE "{table}" SET "{col}"=NULL WHERE "{col}"=?', (item_id,))
        else:
            cur.execute(f'DELETE FROM "{table}" WHERE "{col}"=?', (item_id,))
    cur.execute("DELETE FROM items WHERE item_id=?", (item_id,))


def main():
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = f"backend/erp_backup_before_memo13_{ts}.db"
    shutil.copy(DB, bak)
    print(f"backup -> {bak}")

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys=OFF")
    cur = con.cursor()
    now = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 멱등 가드: 신규 코드 선존재 검사
        for _, code, _, _ in NEW_ITEMS:
            if cur.execute("SELECT 1 FROM items WHERE erp_code=?", (code,)).fetchone():
                raise SystemExit(f"신규 코드 {code} 가 이미 존재 — 백업 복원 후 재실행")

        def item_id_of(code):
            r = cur.execute(
                "SELECT item_id FROM items WHERE erp_code=?", (code,)
            ).fetchone()
            if not r:
                raise SystemExit(f"{code} 가 DB에 없음 — 중단")
            return r[0]

        # --- A. 이름 수정 ---
        for code, new_name in RENAMES.items():
            n = cur.execute(
                "UPDATE items SET item_name=?, updated_at=? WHERE erp_code=?",
                (new_name, now, code),
            ).rowcount
            print(f"[A] {code} 이름수정 ({n}행)")

        # --- B. #9 repoint (삭제 전에) ---
        from_id = item_id_of(REPOINT_FROM)
        to_id = item_id_of(REPOINT_TO)
        n = cur.execute(
            "UPDATE bom SET child_item_id=? WHERE child_item_id=?", (to_id, from_id)
        ).rowcount
        print(f"[B#9] {REPOINT_FROM} → {REPOINT_TO} BOM repoint ({n}행)")

        # --- B. 삭제 2건 (의존행 전부 정리) ---
        fks = discover_item_fks(cur)
        for code in DELETE_CODES:
            iid = item_id_of(code)
            purge_item(cur, iid, fks)
            print(f"[B] {code} 삭제 (의존행 정리 포함)")

        # --- C. 신규 19항목 ---
        max_sort = cur.execute(
            "SELECT COALESCE(MAX(sort_order),0) FROM items"
        ).fetchone()[0]
        ins = 0
        for name, code, ptc, msym in NEW_ITEMS:
            max_sort += 1
            serial = int(code.rsplit("-", 1)[1])
            cur.execute(
                """INSERT INTO items
                   (item_id,item_code,item_name,sort_order,spec,unit,
                    created_at,updated_at,barcode,supplier,min_stock,
                    erp_code,model_symbol,symbol_slot,process_type_code,
                    option_code,serial_no,bom_completed_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()), code, name, max_sort, None, "EA",
                    now, now, code, None, 200,
                    code, msym, None, ptc,
                    None, serial, None,
                ),
            )
            ins += 1
        print(f"[C] 신규 {ins}항목 INSERT")

        con.commit()
        print("commit 완료")
    except BaseException as e:
        con.rollback()
        print(f"롤백됨: {e}")
        raise
    finally:
        con.close()


if __name__ == "__main__":
    main()
