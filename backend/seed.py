"""
Seed SQLite ERP data from ERP_Master_DB.csv.

Usage:
    python backend/seed.py
    cd backend && python seed.py
"""

from __future__ import annotations

import csv
import os
import sys
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
CSV_PATH = PROJECT_ROOT / "ERP_Master_DB.csv"
SQLITE_PATH = BACKEND_DIR / "erp.db"

sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{SQLITE_PATH.as_posix()}"

from app.database import Base, SessionLocal, engine
from app.models import CategoryEnum, Inventory, Item


CATEGORY_MAP = {
    "RM": CategoryEnum.RM,
    "TA": CategoryEnum.TA,
    "TF": CategoryEnum.TF,
    "HA": CategoryEnum.HA,
    "HF": CategoryEnum.HF,
    "VA": CategoryEnum.VA,
    "VF": CategoryEnum.VF,
    "BA": CategoryEnum.BA,
    "BF": CategoryEnum.BF,
    "FG": CategoryEnum.FG,
    "UK": CategoryEnum.UK,
}

CATEGORY_TO_FILE_TYPE: dict[str, str] = {
    "RM": "원자재",
    "TA": "조립자재",
    "TF": "조립자재",
    "HA": "발생부자재",
    "HF": "발생부자재",
    "VA": "발생부자재",
    "VF": "발생부자재",
    "BA": "조립자재",
    "BF": "조립자재",
    "FG": "완제품",
}

CATEGORY_TO_PART: dict[str, str] = {
    "RM": "자재창고",
    "TA": "튜닝파트",
    "TF": "튜닝파트",
    "HA": "고압파트",
    "HF": "고압파트",
    "VA": "진공파트",
    "VF": "진공파트",
    "BA": "조립출하",
    "BF": "조립출하",
    "FG": "출하",
}

DEFAULT_STOCK_QTY = Decimal("100")


def parse_decimal(value: str | None) -> Decimal | None:
    if value is None:
        return None

    text = str(value).strip()
    if text in {"", "None", "N/A", "-"}:
        return None

    try:
        return Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None


def get_category(code: str | None) -> CategoryEnum:
    if not code:
        return CategoryEnum.UK
    return CATEGORY_MAP.get(str(code).strip().upper(), CategoryEnum.UK)


def run_seed() -> None:
    seed()


def seed() -> None:
    if not CSV_PATH.exists():
        raise FileNotFoundError(f"CSV file not found: {CSV_PATH}")

    Base.metadata.create_all(bind=engine)

    with CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))

    if not rows:
        print("Seed skipped: CSV is empty.")
        return

    db = SessionLocal()

    inserted = 0
    skipped = 0
    defaulted_stock = 0
    category_counts: Counter[str] = Counter()
    errors: list[str] = []

    try:
        db.query(Inventory).delete()
        db.query(Item).delete()
        db.commit()

        now = datetime.now(UTC).replace(tzinfo=None)

        for csv_row_number, row in enumerate(rows, start=2):
            item_code = (row.get("item_id") or "").strip()
            item_name = (row.get("std_name") or "").strip()

            if not item_name:
                skipped += 1
                errors.append(f"row {csv_row_number}: missing std_name")
                continue

            if not item_code:
                item_code = f"AUTO-{csv_row_number:05d}"

            raw_category_code = (row.get("category_code") or "").strip().upper()
            category = get_category(raw_category_code)
            spec = (row.get("std_spec") or "").strip() or None
            unit = (row.get("std_unit") or "").strip() or "EA"
            location = (row.get("department") or "").strip() or None

            barcode = item_code
            legacy_file_type = CATEGORY_TO_FILE_TYPE.get(raw_category_code, "미분류")
            legacy_part = CATEGORY_TO_PART.get(raw_category_code, "자재창고")
            legacy_item_type = (row.get("part_type") or "").strip() or None
            legacy_model_raw = (row.get("model_ref") or "").strip()
            legacy_model = legacy_model_raw if legacy_model_raw else "공용"
            supplier = (row.get("supplier") or "").strip() or None
            min_stock = parse_decimal(row.get("safety_stock"))

            stock_current = parse_decimal(row.get("stock_current"))
            if stock_current is None or stock_current == 0:
                quantity = DEFAULT_STOCK_QTY
                defaulted_stock += 1
            else:
                quantity = stock_current

            item = Item(
                item_code=item_code,
                item_name=item_name,
                spec=spec,
                category=category,
                unit=unit,
                barcode=barcode,
                legacy_file_type=legacy_file_type,
                legacy_part=legacy_part,
                legacy_item_type=legacy_item_type,
                legacy_model=legacy_model,
                supplier=supplier,
                min_stock=min_stock,
                created_at=now,
                updated_at=now,
            )
            db.add(item)
            db.flush()

            inventory = Inventory(
                item_id=item.item_id,
                quantity=quantity,
                location=location,
                updated_at=now,
            )
            db.add(inventory)

            inserted += 1
            category_counts[category.value] += 1

            if inserted % 200 == 0:
                db.commit()

        db.commit()

        print(f"Seed complete for SQLite database: {SQLITE_PATH}")
        print(f"CSV rows read: {len(rows)}")
        print(f"Items inserted: {inserted}")
        print(f"Rows skipped: {skipped}")
        print(f"Default stock=100 applied: {defaulted_stock}")
        print("Category counts:")
        for code in ["RM", "TA", "TF", "HA", "HF", "VA", "VF", "BA", "BF", "FG", "UK"]:
            print(f"  {code}: {category_counts.get(code, 0)}")

        if errors:
            print("Sample skipped rows:")
            for message in errors[:10]:
                print(f"  - {message}")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
