"""category 제거 전 레거시 보정 스크립트이며, 현재 process_type_code 단일 구조에서는 사용하지 않는다.

원본: backend/fix_unclassified.py
아카이브 이유: Item.category / CategoryEnum 제거 이후 더 이상 실행 불가.
"""
# ── 이하 원본 코드 (참조용, 실행 금지) ──────────────────────────────────────

import random
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import (
    Item, Inventory, InventoryLocation, LocationStatusEnum, DepartmentEnum
)

random.seed(42)

ALL_SYMBOLS = ["3", "4", "6", "7", "8"]

LEGACY_TO_SYMBOL: dict[str, str] = {
    "DX3000":    "3",
    "COCOON":    "7",
    "SOLO":      "8",
    "ADX4000W":  "4",
    "ADX6000FB": "6",
    "ADX6000":   "6",
}

PROCESS_TO_DEPT: dict[str, DepartmentEnum] = {
    "TR": DepartmentEnum.TUBE,    "TA": DepartmentEnum.TUBE,    "TF": DepartmentEnum.TUBE,
    "HR": DepartmentEnum.HIGH_VOLTAGE, "HA": DepartmentEnum.HIGH_VOLTAGE, "HF": DepartmentEnum.HIGH_VOLTAGE,
    "VR": DepartmentEnum.VACUUM,  "VA": DepartmentEnum.VACUUM,  "VF": DepartmentEnum.VACUUM,
    "NR": DepartmentEnum.TUNING,  "NA": DepartmentEnum.TUNING,  "NF": DepartmentEnum.TUNING,
    "AR": DepartmentEnum.ASSEMBLY, "AA": DepartmentEnum.ASSEMBLY, "AF": DepartmentEnum.ASSEMBLY,
    "PR": DepartmentEnum.SHIPPING, "PA": DepartmentEnum.SHIPPING, "PF": DepartmentEnum.SHIPPING,
}


def pick_symbol(process_type_code: str | None, legacy_model: str | None, erp_code: str | None) -> str:
    if erp_code:
        parts = erp_code.split("-")
        if parts and all(c in ALL_SYMBOLS for c in parts[0]):
            return parts[0]
    if legacy_model and legacy_model in LEGACY_TO_SYMBOL:
        return LEGACY_TO_SYMBOL[legacy_model]
    k = random.randint(1, 2)
    return "".join(sorted(random.sample(ALL_SYMBOLS, k)))


def main():
    db = SessionLocal()

    null_model_items = db.query(Item).filter(Item.model_symbol.is_(None)).all()
    print(f"[1] model_symbol NULL 품목: {len(null_model_items)}개")

    filled_model = 0
    for item in null_model_items:
        symbol = pick_symbol(item.process_type_code, item.legacy_model, item.erp_code)
        item.model_symbol = symbol
        filled_model += 1

    db.flush()
    print(f"    → {filled_model}개 model_symbol 채움")

    existing_locs = {
        row[0] for row in db.query(InventoryLocation.item_id).distinct().all()
    }

    r_codes = {"TR", "HR", "VR", "NR", "AR", "PR"}
    non_rm_items = db.query(Item).filter(Item.process_type_code.notin_(r_codes)).all()
    no_dept_items = [i for i in non_rm_items if i.item_id not in existing_locs]
    print(f"\n[2] InventoryLocation 없는 비-원자재 품목: {len(no_dept_items)}개")

    added_locs = 0
    for item in no_dept_items:
        dept = PROCESS_TO_DEPT.get(item.process_type_code or "", DepartmentEnum.ASSEMBLY)
        exists = db.query(InventoryLocation).filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        ).first()
        if exists:
            continue
        loc = InventoryLocation(
            item_id=item.item_id,
            department=dept,
            status=LocationStatusEnum.PRODUCTION,
            quantity=Decimal("0"),
        )
        db.add(loc)
        added_locs += 1

    db.commit()
    print(f"    → {added_locs}개 InventoryLocation 추가")


if __name__ == "__main__":
    main()
