"""PF 의 model_symbol 분포 / 자동 대표 PF 선정 결과 확인용 스크립트."""
import sqlite3
import sys
from pathlib import Path


def main() -> None:
    db = Path(__file__).resolve().parents[1] / "mes.db"
    if not db.exists():
        print(f"DB 없음: {db}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(db)
    cur = con.cursor()

    print("== PF model_symbol 분포 ==")
    rows = cur.execute(
        "SELECT model_symbol, COUNT(*) FROM items "
        "WHERE process_type_code='PF' GROUP BY model_symbol "
        "ORDER BY model_symbol"
    ).fetchall()
    for ms, cnt in rows:
        print(f"  {repr(ms):20s} {cnt}건")

    print()
    print("== PF 샘플 (model_symbol, item_code, item_name) ==")
    for row in cur.execute(
        "SELECT model_symbol, item_code, item_name FROM items "
        "WHERE process_type_code='PF' "
        "ORDER BY model_symbol, COALESCE(item_code, item_name) "
        "LIMIT 40"
    ).fetchall():
        print(f"  ms={repr(row[0]):8s} code={repr(row[1]):20s} name={row[2]}")

    print()
    print("== 모델별 자연 정렬 첫 PF (= 자동 대표 PF) ==")
    rows = cur.execute(
        "SELECT model_symbol, item_code, item_name FROM items "
        "WHERE process_type_code='PF' AND model_symbol IS NOT NULL "
        "ORDER BY model_symbol, COALESCE(item_code, item_name)"
    ).fetchall()
    seen = set()
    for ms, code, name in rows:
        if ms in seen:
            continue
        seen.add(ms)
        print(f"  모델{ms}: code={code!r} name={name!r}")

    con.close()


if __name__ == "__main__":
    main()
