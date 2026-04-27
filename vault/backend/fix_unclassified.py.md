---
type: code-note
project: ERP
layer: backend
source_path: backend/fix_unclassified.py
status: active
updated: 2026-04-27
source_sha: 1ae5c953ce17
tags:
  - erp
  - backend
  - source-file
  - py
---

# fix_unclassified.py

> [!summary] 역할
> 원본 프로젝트의 `fix_unclassified.py` 파일을 Obsidian에서 추적하기 위한 미러 노트다.

## 원본 위치

- Source: `backend/fix_unclassified.py`
- Layer: `backend`
- Kind: `source-file`
- Size: `5790` bytes

## 연결

- Parent hub: [[backend/backend|backend]]
- Related: [[backend/backend]]

## 읽는 포인트

- 실제 수정은 원본 파일에서 한다.
- Vault 노트는 구조 파악과 인수인계를 돕는 설명 레이어다.

## 원본 발췌

````python
"""모델·부서 미할당 품목을 채우는 스크립트.

- model_symbol NULL → legacy_model 또는 erp_code로 추론, 없으면 랜덤
- InventoryLocation 없는 비-RM 품목 → 카테고리 기반 부서로 0수량 행 추가
"""
import random
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
from app.models import (
    Item, CategoryEnum, Inventory, InventoryLocation, LocationStatusEnum, DepartmentEnum
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

CAT_TO_DEPT: dict[str, DepartmentEnum] = {
    "TA": DepartmentEnum.TUBE,
    "TF": DepartmentEnum.TUBE,
    "HA": DepartmentEnum.HIGH_VOLTAGE,
    "HF": DepartmentEnum.HIGH_VOLTAGE,
    "VA": DepartmentEnum.VACUUM,
    "VF": DepartmentEnum.VACUUM,
    "AA": DepartmentEnum.ASSEMBLY,
    "AF": DepartmentEnum.ASSEMBLY,
    "FG": DepartmentEnum.SHIPPING,
}

PROCESS_TO_DEPT: dict[str, DepartmentEnum] = {
    "TR": DepartmentEnum.TUBE,    "TA": DepartmentEnum.TUBE,    "TF": DepartmentEnum.TUBE,
    "HR": DepartmentEnum.HIGH_VOLTAGE, "HA": DepartmentEnum.HIGH_VOLTAGE, "HF": DepartmentEnum.HIGH_VOLTAGE,
    "VR": DepartmentEnum.VACUUM,  "VA": DepartmentEnum.VACUUM,  "VF": DepartmentEnum.VACUUM,
    "NR": DepartmentEnum.TUNING,  "NA": DepartmentEnum.TUNING,  "NF": DepartmentEnum.TUNING,
    "AR": DepartmentEnum.ASSEMBLY, "AA": DepartmentEnum.ASSEMBLY, "AF": DepartmentEnum.ASSEMBLY,
    "PR": DepartmentEnum.SHIPPING, "PA": DepartmentEnum.SHIPPING, "PF": DepartmentEnum.SHIPPING,
}


def pick_symbol(category: str, legacy_model: str | None, erp_code: str | None) -> str:
    # 1. erp_code에서 추출
    if erp_code:
        parts = erp_code.split("-")
        if parts and all(c in ALL_SYMBOLS for c in parts[0]):
            return parts[0]
    # 2. legacy_model 매핑
    if legacy_model and legacy_model in LEGACY_TO_SYMBOL:
        return LEGACY_TO_SYMBOL[legacy_model]
    # 3. 카테고리별 랜덤
    if category == "FG":
        return random.choice(ALL_SYMBOLS)
    elif category in {"TA", "TF", "HA", "HF", "VA", "VF", "AA", "AF"}:
        k = random.randint(1, 2)
        return "".join(sorted(random.sample(ALL_SYMBOLS, k)))
    else:  # RM, UK
        k = random.randint(1, 3)
        return "".join(sorted(random.sample(ALL_SYMBOLS, k)))


def main():
    db = SessionLocal()

    # ── 1. model_symbol 채우기 ────────────────────────────────────────────
    null_model_items = db.query(Item).filter(Item.model_symbol.is_(None)).all()
    print(f"[1] model_symbol NULL 품목: {len(null_model_items)}개")

    filled_model = 0
    for item in null_model_items:
        symbol = pick_symbol(item.category.value, item.legacy_model, item.erp_code)
        item.model_symbol = symbol
        filled_model += 1

    db.flush()
    print(f"    → {filled_model}개 model_symbol 채움")

    # ── 2. InventoryLocation 없는 비-RM 품목에 부서 행 추가 ──────────────
    existing_locs = {
        row[0] for row in db.query(InventoryLocation.item_id).distinct().all()
    }

    non_rm_items = (
        db.query(Item)
        .filter(Item.category != CategoryEnum.RM)
        .all()
    )
    no_dept_items = [i for i in non_rm_items if i.item_id not in existing_locs]
    print(f"\n[2] InventoryLocation 없는 비-RM 품목: {len(no_dept_items)}개")

    added_locs = 0
    for item in no_dept_items:
        dept = CAT_TO_DEPT.get(item.category.value)
        if dept is None:
            pt = item.process_type_code or ""
            dept = PROCESS_TO_DEPT.get(pt, DepartmentEnum.ASSEMBLY)

        # 이미 있으면 skip (flush 후 중복 방지)
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

    # ── 3. RM 품목 중 부서 확인 ──────────────────────────────────────────
    rm_items = db.query(Item).filter(Item.category == CategoryEnum.RM).all()
    rm_no_dept = [i for i in rm_items if i.item_id not in existing_locs and i.item_id not in {
        row[0] for row in db.query(InventoryLocation.item_id).distinct().all()
    }]
    print(f"\n[3] RM 품목 중 부서 미할당(창고 전용): {len(rm_no_dept)}개 — 창고 보관으로 정상")

    # ── 결과 통계 ─────────────────────────────────────────────────────────
    remaining_null = db.query(Item).filter(Item.model_symbol.is_(None)).count()
    total_locs = db.query(InventoryLocation.item_id).distinct().count()
    print(f"\n완료!")
    print(f"  model_symbol NULL 남은 수: {remaining_null}")
    print(f"  InventoryLocation 있는 품목 수: {total_locs}")


if __name__ == "__main__":
    main()
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
