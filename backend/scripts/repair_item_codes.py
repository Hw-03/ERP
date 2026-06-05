"""품목 코드 일관성 일괄 정리.

mes_code 가 (model_symbol, process_type_code, serial_no) 와
어긋난 부품을 점검하고, --apply 옵션 시 갱신한다.

- 카테고리 어긋남 (mes_code 의 카테고리 != item.process_type_code):
  새 카테고리에서 next_serial_no 부여. serial_no 갱신.
- 모델 어긋남 (카테고리는 같은데 prefix 가 어긋남):
  serial 유지, prefix 만 갱신.

사용법:
  python scripts/repair_mes_codes.py            # dry-run (변경 후보만 출력)
  python scripts/repair_mes_codes.py --apply    # 실제 변경 적용
"""

from __future__ import annotations

import argparse
import re
import shutil
import sys
from datetime import UTC, datetime
from pathlib import Path

# repo root 의 backend/ 에서 실행. PYTHONPATH 자동 설정.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.database import SessionLocal  # noqa: E402
from app.models import Item  # noqa: E402
from app.utils.mes_code import make_mes_code, next_serial_no  # noqa: E402

CODE_PATTERN = re.compile(r"^(?P<prefix>[0-9]+)-(?P<pt>[A-Z]{2})-(?P<serial>\d{4})$")


def parse_code(code: str) -> dict | None:
    m = CODE_PATTERN.match(code)
    return m.groupdict() if m else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="실제 변경 적용 (기본은 dry-run)")
    args = parser.parse_args()

    if args.apply:
        # 백업
        db_path = BACKEND_DIR / "mes.db"
        backup_dir = BACKEND_DIR / "_backup"
        backup_dir.mkdir(exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
        backup_path = backup_dir / f"mes_pre_repair_codes_{stamp}.db"
        shutil.copy2(db_path, backup_path)
        print(f"[backup] {backup_path}")

    db = SessionLocal()
    try:
        items = (
            db.query(Item)
            .filter(Item.deleted_at.is_(None))
            .filter(Item.mes_code.isnot(None))
            .order_by(Item.process_type_code, Item.serial_no)
            .all()
        )

        candidates: list[tuple[Item, str, str]] = []  # (item, kind, new_code)
        # in-memory serial 카운터: 카테고리 변경 분에 새 번호 부여할 때 같은 카테고리에 여러 부품이 옮겨가는 경우 충돌 방지.
        # next_serial_no 호출 결과를 매번 +1 해서 같은 process_type 안 중복 안 나게 한다.
        category_counter: dict[str, int] = {}

        for item in items:
            sym = item.model_symbol
            pt = item.process_type_code
            serial = item.serial_no
            if not sym or not pt or serial is None:
                continue

            expected_same_serial = make_mes_code(sym, pt, serial)
            if item.mes_code == expected_same_serial:
                continue  # 일치 — 건너뜀

            # 어긋남. 어떤 종류인지 분류.
            parsed = parse_code(item.mes_code or "")
            old_pt = parsed["pt"] if parsed else None
            category_changed = old_pt is not None and old_pt != pt

            if category_changed:
                # 새 카테고리에서 다음 번호 부여.
                if pt not in category_counter:
                    category_counter[pt] = next_serial_no("", pt, db)  # model_symbol 인자는 미사용 (utils 주석 참고)
                else:
                    category_counter[pt] += 1
                new_serial = category_counter[pt]
                new_code = make_mes_code(sym, pt, new_serial)
                candidates.append((item, "category", new_code))
            else:
                # serial 유지. prefix(모델) 어긋남.
                old_prefix = parsed["prefix"] if parsed else None
                model_changed = old_prefix is not None and old_prefix != sym
                if model_changed:
                    candidates.append((item, "prefix", expected_same_serial))

        # 출력
        print(f"\n어긋난 부품 총 {len(candidates)}개\n")
        print(f"{'kind':16} {'old_code':28} -> {'new_code':28}  name")
        print("-" * 100)
        for item, kind, new_code in candidates:
            print(f"{kind:16} {item.mes_code:28} -> {new_code:28}  {item.item_name[:40]}")

        if not args.apply:
            print("\n[dry-run] 실제 변경하려면 --apply 옵션을 추가하세요.")
            return 0

        # 적용
        print("\n[apply] 변경 적용 중...")
        for item, kind, new_code in candidates:
            # 새 코드의 serial 도 갱신 필요 (카테고리 변경 분).
            parsed_new = parse_code(new_code)
            if parsed_new:
                item.serial_no = int(parsed_new["serial"])
            item.mes_code = new_code
            item.updated_at = datetime.now(UTC).replace(tzinfo=None)
        db.commit()
        print(f"[apply] done - {len(candidates)} updated.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
