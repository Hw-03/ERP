"""
Seed SQLite ERP data from ERP_Master_DB.csv.

Usage:
    python backend/seed.py
    cd backend && python seed.py
"""

from __future__ import annotations

import csv
import json
import os
import re
import sys
from argparse import ArgumentParser
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
CSV_PATH = PROJECT_ROOT / "ERP_Master_DB.csv"
SQLITE_PATH = BACKEND_DIR / "erp.db"
LEGACY_HTML_PATH = PROJECT_ROOT / "_legacy_import" / "inventory_v2.html"

sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{SQLITE_PATH.as_posix()}"

from app.database import Base, SessionLocal, engine
from app.models import (
    BOM,
    CategoryEnum,
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    Item,
    ShipPackage,
    ShipPackageItem,
    TransactionLog,
)


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

LEGACY_DEPARTMENT_MAP = {
    "조립": DepartmentEnum.ASSEMBLY,
    "고압": DepartmentEnum.HIGH_VOLTAGE,
    "진공": DepartmentEnum.VACUUM,
    "튜닝": DepartmentEnum.TUNING,
    "튜브": DepartmentEnum.TUBE,
    "AS": DepartmentEnum.AS,
    "연구소": DepartmentEnum.RESEARCH,
    "영업": DepartmentEnum.SALES,
    "출하": DepartmentEnum.SHIPPING,
    "기타": DepartmentEnum.ETC,
}


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


def infer_legacy_category(file_type: str | None, part: str | None) -> CategoryEnum:
    file_type = (file_type or "").strip()
    part = (part or "").strip()

    if file_type == "원자재":
        return CategoryEnum.RM
    if file_type == "완제품" or part == "출하":
        return CategoryEnum.FG
    if file_type == "조립자재":
        return CategoryEnum.BA
    if file_type == "발생부자재":
        if "고압" in part:
            return CategoryEnum.HA
        if "진공" in part:
            return CategoryEnum.VA
        if "튜닝" in part or "튜브" in part:
            return CategoryEnum.TA
    return CategoryEnum.UK


def infer_employee_level(role: str) -> EmployeeLevelEnum:
    if "대표" in role:
        return EmployeeLevelEnum.ADMIN
    if any(keyword in role for keyword in ("부장", "과장", "책임")):
        return EmployeeLevelEnum.MANAGER
    return EmployeeLevelEnum.STAFF


def extract_legacy_init_db() -> dict:
    if not LEGACY_HTML_PATH.exists():
        raise FileNotFoundError(f"Legacy HTML file not found: {LEGACY_HTML_PATH}")

    text = LEGACY_HTML_PATH.read_text(encoding="utf-8")
    match = re.search(r"var INIT_DB=(\{.*?\});</script>", text, re.S)
    if not match:
        raise ValueError("Could not locate INIT_DB in legacy HTML.")
    return json.loads(match.group(1))


def reset_core_tables(db) -> None:
    db.query(ShipPackageItem).delete()
    db.query(ShipPackage).delete()
    db.query(BOM).delete()
    db.query(TransactionLog).delete()
    db.query(Inventory).delete()
    db.query(Item).delete()
    db.query(Employee).delete()
    db.commit()


DEFAULT_EMPLOYEES = [
    {"code": "EMP-001", "name": "김준우", "role": "조립 부장", "department": DepartmentEnum.ASSEMBLY},
    {"code": "EMP-002", "name": "박서연", "role": "진공 사원", "department": DepartmentEnum.VACUUM},
    {"code": "EMP-003", "name": "이도현", "role": "튜닝 사원", "department": DepartmentEnum.TUNING},
    {"code": "EMP-004", "name": "최민지", "role": "고압 사원", "department": DepartmentEnum.HIGH_VOLTAGE},
    {"code": "EMP-005", "name": "정하늘", "role": "튜브 사원", "department": DepartmentEnum.TUBE},
    {"code": "EMP-006", "name": "한유진", "role": "출하 사원", "department": DepartmentEnum.SHIPPING},
    {"code": "EMP-007", "name": "오지훈", "role": "연구 사원", "department": DepartmentEnum.RESEARCH},
    {"code": "EMP-008", "name": "윤은",   "role": "AS 사원",   "department": DepartmentEnum.AS},
    {"code": "EMP-009", "name": "문현우", "role": "영업 사원", "department": DepartmentEnum.SALES},
]


def seed_employees(db, now) -> None:
    """직원 테이블이 비어있을 때 기본 직원 목록을 삽입한다."""
    if db.query(Employee).count() > 0:
        return
    for order, emp in enumerate(DEFAULT_EMPLOYEES):
        db.add(Employee(
            employee_code=emp["code"],
            name=emp["name"],
            role=emp["role"],
            phone=None,
            department=emp["department"],
            level=infer_employee_level(emp["role"]),
            display_order=order,
            is_active="true",
            created_at=now,
            updated_at=now,
        ))
    db.commit()
    print(f"Default employees inserted: {len(DEFAULT_EMPLOYEES)}")


def seed_from_legacy_html() -> None:
    Base.metadata.create_all(bind=engine)
    init_db = extract_legacy_init_db()
    employees = init_db.get("employees", [])
    products = init_db.get("products", [])
    db = SessionLocal()

    try:
        reset_core_tables(db)
        now = datetime.now(UTC).replace(tzinfo=None)

        for order, employee in enumerate(employees):
            role = str(employee.get("role") or "").strip() or "사원"
            department = LEGACY_DEPARTMENT_MAP.get(
                str(employee.get("category") or "").strip(),
                DepartmentEnum.ETC,
            )
            db.add(
                Employee(
                    employee_code=str(employee.get("id") or f"EMP-{order + 1:03d}").strip(),
                    name=str(employee.get("name") or f"직원 {order + 1}").strip(),
                    role=role,
                    phone=None,
                    department=department,
                    level=infer_employee_level(role),
                    display_order=order,
                    is_active="true",
                    created_at=now,
                    updated_at=now,
                )
            )

        for product in products:
            item_code = str(product.get("id") or "").strip()
            item_name = str(product.get("name") or "").strip()
            if not item_code or not item_name:
                continue

            file_type = str(product.get("fileType") or "").strip() or None
            part = str(product.get("part") or "").strip() or None
            model = str(product.get("model") or "").strip() or "공용"
            quantity = parse_decimal(product.get("stock"))
            min_stock = parse_decimal(product.get("minStock"))

            item = Item(
                item_code=item_code,
                item_name=item_name,
                spec=str(product.get("spec") or "").strip() or None,
                category=infer_legacy_category(file_type, part),
                unit="EA",
                barcode=str(product.get("barcode") or "").strip() or item_code,
                legacy_file_type=file_type,
                legacy_part=part,
                legacy_item_type=str(product.get("itemType") or "").strip() or None,
                legacy_model=model,
                supplier=str(product.get("supplier") or "").strip() or None,
                min_stock=min_stock,
                created_at=now,
                updated_at=now,
            )
            db.add(item)
            db.flush()

            db.add(
                Inventory(
                    item_id=item.item_id,
                    quantity=quantity or Decimal("0"),
                    location=part,
                    updated_at=now,
                )
            )

        db.commit()
        print(f"Legacy HTML seed complete: {LEGACY_HTML_PATH}")
        print(f"Employees inserted: {len(employees)}")
        print(f"Items inserted: {len(products)}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


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
    now = datetime.now(UTC).replace(tzinfo=None)
    seed_employees(db, now)

    inserted = 0
    skipped = 0
    defaulted_stock = 0
    category_counts: Counter[str] = Counter()
    errors: list[str] = []

    try:
        db.query(Inventory).delete()
        db.query(Item).delete()
        db.commit()

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
    parser = ArgumentParser()
    parser.add_argument(
        "--source",
        choices=["csv", "legacy-html"],
        default="csv",
        help="Select the seed source.",
    )
    args = parser.parse_args()

    if args.source == "legacy-html":
        seed_from_legacy_html()
    else:
        seed()
