---
type: code-note
project: ERP
layer: scripts
source_path: scripts/migrations/reapply_erp_codes.py
status: active
updated: 2026-04-27
source_sha: c79e0c869987
tags:
  - erp
  - scripts
  - migration-script
  - py
---

# reapply_erp_codes.py

> [!summary] 역할
> 기존 데이터나 스키마를 새 기준에 맞추기 위해 한 번 실행하는 마이그레이션 스크립트다.

## 원본 위치

- Source: `scripts/migrations/reapply_erp_codes.py`
- Layer: `scripts`
- Kind: `migration-script`
- Size: `5851` bytes

## 연결

- Parent hub: [[scripts/migrations/migrations|scripts/migrations]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

````python
"""971개 품목의 ERP 코드를 새 체계(다중 모델 기호)로 일괄 재부여.

사용법:
  python scripts/migrations/reapply_erp_codes.py           # dry-run (기본)
  python scripts/migrations/reapply_erp_codes.py --apply   # 실제 DB 반영

규칙:
  - legacy_model 컬럼 기반으로 model_symbol 파생
  - process_type_code 기존 값 + model_symbol 조합으로 시리얼 1부터 재부여
  - "공용"/None legacy_model 품목 → model_symbol="" (NULL), erp_code=NULL 유지
  - item_models 조인 테이블에 (item_id, slot) 삽입
"""

import sys
import sqlite3
import argparse
from pathlib import Path
from collections import defaultdict

DB_PATH = Path(__file__).parent.parent.parent / "backend" / "erp.db"

LEGACY_MODEL_TO_SLOT = {
    "DX3000":    1,
    "COCOON":    2,
    "SOLO":      3,
    "ADX4000W":  4,
    "ADX6000FB": 5,
    "ADX6000":   5,
}

SLOT_TO_SYMBOL = {
    1: "3",
    2: "7",
    3: "8",
    4: "4",
    5: "6",
}


def slots_to_symbol(slots: list[int]) -> str:
    return "".join(sorted(SLOT_TO_SYMBOL[s] for s in slots if s in SLOT_TO_SYMBOL))


def make_erp_code(model_symbol: str, process_type: str, serial_no: int, option_code: str | None = None) -> str:
    base = f"{model_symbol}-{process_type}-{serial_no:04d}"
    return f"{base}-{option_code}" if option_code else base


def main():
    parser = argparse.ArgumentParser(description="ERP 코드 일괄 재부여")
    parser.add_argument("--apply", action="store_true", help="실제 DB 반영 (기본: dry-run)")
    args = parser.parse_args()
    dry_run = not args.apply

    if not DB_PATH.exists():
        print(f"[오류] DB 파일 없음: {DB_PATH}")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # item_models 테이블이 없으면 안내
    tables = {r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
    if "item_models" not in tables:
        print("[오류] item_models 테이블이 없습니다. 먼저 migrate_erp_schema.py를 실행하세요.")
        conn.close()
        sys.exit(1)

    items = cur.execute(
        "SELECT item_id, item_code, legacy_model, process_type_code, option_code FROM items ORDER BY item_code"
    ).fetchall()

    print(f"전체 품목: {len(items)}개")

    # (model_symbol, process_type) 기준으로 serial 1부터 순번 배정
    serial_counter: dict[tuple[str, str], int] = defaultdict(int)

    stats = {"assigned": 0, "skipped_no_model": 0, "skipped_no_process": 0}
    updates: list[tuple] = []
    item_model_inserts: list[tuple] = []
    item_model_deletes: list[str] = []

    for row in items:
        item_id = row["item_id"]
        legacy_model = row["legacy_model"] or ""
        process_type = row["process_type_code"]
        option_code = row["option_code"]

        slot = LEGACY_MODEL_TO_SLOT.get(legacy_model)
        slots = [slot] if slot else []
        model_sym = slots_to_symbol(slots)

        if not model_sym:
            stats["skipped_no_model"] += 1
            updates.append((None, None, None, None, item_id))
            item_model_deletes.append(item_id)
            continue

        if not process_type:
            stats["skipped_no_process"] += 1
            updates.append((None, model_sym, None, None, item_id))
            item_model_deletes.append(item_id)
            for s in slots:
                item_model_inserts.append((item_id, s))
            continue

        key = (model_sym, process_type)
        serial_counter[key] += 1
        serial = serial_counter[key]
        erp_code = make_erp_code(model_sym, process_type, serial, option_code)
        stats["assigned"] += 1
        updates.append((erp_code, model_sym, serial, slot, item_id))
        item_model_deletes.append(item_id)
        for s in slots:
            item_model_inserts.append((item_id, s))

    print(f"\n결과 예상:")
    print(f"  ERP 코드 부여: {stats['assigned']}건")
    print(f"  모델 미지정 (공용/없음): {stats['skipped_no_model']}건 → erp_code=NULL")
    print(f"  공정 코드 없음: {stats['skipped_no_process']}건 → erp_code=NULL")

    if dry_run:
        print("\n[dry-run 모드] DB는 변경되지 않습니다. --apply 옵션으로 실행하면 반영됩니다.")
        # 샘플 5건 출력
        print("\n샘플 (상위 5건):")
        for row, upd in zip(items[:5], updates[:5]):
            erp, sym, ser, slt, _ = upd
            print(f"  {row['item_code']} | legacy_model={row['legacy_model']} | "
                  f"process={row['process_type_code']} → erp_code={erp} (symbol={sym}, serial={ser})")
        conn.close()
        return

    # 실제 DB 반영
    print("\n[적용 중...]")

    # 기존 erp_code 전체 초기화 (UNIQUE 충돌 방지)
    cur.execute("UPDATE items SET erp_code = NULL, model_symbol = NULL, serial_no = NULL")

    # item_models 기존 행 전체 삭제 후 재삽입
    cur.execute("DELETE FROM item_models")

    for item_id, slot in item_model_inserts:
        cur.execute(
            "INSERT OR IGNORE INTO item_models (item_id, slot) VALUES (?, ?)",
            (item_id, slot),
        )

    # items 업데이트
    for erp_code, model_sym, serial, slot, item_id in updates:
        cur.execute(
            "UPDATE items SET erp_code=?, model_symbol=?, serial_no=?, symbol_slot=? WHERE item_id=?",
            (erp_code, model_sym, serial, slot, item_id),
        )

    conn.commit()
    conn.close()

    print(f"완료! ERP 코드 부여: {stats['assigned']}건 / 미부여: {stats['skipped_no_model'] + stats['skipped_no_process']}건")


if __name__ == "__main__":
    main()
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
