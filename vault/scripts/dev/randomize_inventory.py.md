---
type: code-note
project: ERP
layer: scripts
source_path: scripts/dev/randomize_inventory.py
status: active
updated: 2026-04-27
source_sha: e3d6da6fbddb
tags:
  - erp
  - scripts
  - dev-script
  - py
---

# randomize_inventory.py

> [!summary] 역할
> 개발 중 데이터 생성, 점검, 로컬 진단을 돕는 보조 스크립트다.

## 원본 위치

- Source: `scripts/dev/randomize_inventory.py`
- Layer: `scripts`
- Kind: `dev-script`
- Size: `9426` bytes

## 연결

- Parent hub: [[scripts/dev/dev|scripts/dev]]
- Related: [[scripts/scripts]]

## 읽는 포인트

- 실행 전 대상 DB/파일 경로를 확인한다.
- 운영 스크립트는 백업 여부와 되돌림 절차를 먼저 본다.

## 원본 발췌

> 전체 242줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""
창고/부서 랜덤 재고 분배 + 안전재고 설정 스크립트.

Usage:
    python scripts/dev/randomize_inventory.py           # dry-run (미리보기만)
    python scripts/dev/randomize_inventory.py --apply   # 실제 DB 반영

규칙:
- 각 품목의 현재 총 수량을 창고 + 1~3개 부서로 랜덤 분배
- 카테고리별 주요 부서 가중치 반영 (TA→튜브, HA→고압, VA→진공, AA→조립, FG→출하)
- 10% 확률로 불량 재고 추가 (총량의 2-8%)
- 안전재고: 70% 품목에 설정, 그 중 30%는 현재 재고 이하로 설정해 경보 테스트
"""
from __future__ import annotations

import os
import random
import sys
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ["DATABASE_URL"] = f"sqlite:///{(BACKEND_DIR / 'erp.db').as_posix()}"

from app.database import SessionLocal
from app.models import (
    CategoryEnum,
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    Item,
    LocationStatusEnum,
)

random.seed(42)

# 카테고리별 가중 부서 목록 (앞쪽이 더 높은 확률)
CATEGORY_DEPT_WEIGHTS: dict[str, list[tuple[DepartmentEnum, int]]] = {
    "RM": [
        (DepartmentEnum.ASSEMBLY, 3),
        (DepartmentEnum.HIGH_VOLTAGE, 2),
        (DepartmentEnum.VACUUM, 2),
        (DepartmentEnum.TUBE, 2),
        (DepartmentEnum.TUNING, 1),
    ],
    "TA": [(DepartmentEnum.TUBE, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.TUNING, 1)],
    "TF": [(DepartmentEnum.TUBE, 5), (DepartmentEnum.ASSEMBLY, 2)],
    "HA": [(DepartmentEnum.HIGH_VOLTAGE, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.RESEARCH, 1)],
    "HF": [(DepartmentEnum.HIGH_VOLTAGE, 5), (DepartmentEnum.ASSEMBLY, 2)],
    "VA": [(DepartmentEnum.VACUUM, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.TUNING, 1)],
    "VF": [(DepartmentEnum.VACUUM, 5), (DepartmentEnum.ASSEMBLY, 2)],
    "AA": [(DepartmentEnum.ASSEMBLY, 5), (DepartmentEnum.SHIPPING, 2), (DepartmentEnum.HIGH_VOLTAGE, 1)],
    "AF": [(DepartmentEnum.ASSEMBLY, 5), (DepartmentEnum.SHIPPING, 2)],
    "FG": [(DepartmentEnum.SHIPPING, 5), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.SALES, 1)],
    "UK": [(DepartmentEnum.ETC, 3), (DepartmentEnum.ASSEMBLY, 2), (DepartmentEnum.RESEARCH, 1)],
}


def weighted_sample(weights: list[tuple[DepartmentEnum, int]], k: int) -> list[DepartmentEnum]:
    """중복 없이 가중치 샘플링."""
    pool: list[DepartmentEnum] = []
    for dept, w in weights:
        pool.extend([dept] * w)
    seen: set[DepartmentEnum] = set()
    result: list[DepartmentEnum] = []
    random.shuffle(pool)
    for d in pool:
        if d not in seen:
            seen.add(d)
            result.append(d)
        if len(result) >= k:
            break
    return result


def split_quantity(total: Decimal, n: int) -> list[Decimal]:
    """총량을 n개로 랜덤 분할 (각 파트 >= 1)."""
    if n <= 1 or total < n:
        return [total] + [Decimal(0)] * (n - 1)
    max_cuts = min(n - 1, int(total) - 1)
    if max_cuts <= 0:
        return [total] + [Decimal(0)] * (n - 1)
    cuts = sorted(random.sample(range(1, int(total)), max_cuts))
    parts = [Decimal(cuts[0])]
    for i in range(1, len(cuts)):
        parts.append(Decimal(cuts[i] - cuts[i - 1]))
    parts.append(total - Decimal(cuts[-1]))
    # n보다 짧으면 패딩
    while len(parts) < n:
        parts.append(Decimal(0))
    return parts


def randomize(apply: bool = False) -> None:
    db = SessionLocal()
    try:
        items = db.query(Item).all()
        inv_map: dict[str, Inventory] = {
            str(inv.item_id): inv
            for inv in db.query(Inventory).all()
        }

        updated = 0
        safety_set = 0
        safety_alert_preview = 0
        zero_count = 0

        # 품절 대상: 약 7% (랜덤 고정 시드 기준 ~68개)
        zero_item_ids = set(
            item.item_id
            for item in random.sample(items, int(len(items) * 0.07))
        )

        for item in items:
            inv = inv_map.get(str(item.item_id))
            if not inv:
                continue

            # 품절 처리
            if item.item_id in zero_item_ids:
                if apply:
                    inv.quantity = Decimal(0)
                    inv.warehouse_qty = Decimal(0)
                    db.query(InventoryLocation).filter(
                        InventoryLocation.item_id == item.item_id
                    ).delete()
                    item.min_stock = Decimal(random.randint(5, 50))
                zero_count += 1
                updated += 1
                continue

            total = inv.quantity or Decimal(0)
            if total <= 0:
                total = Decimal(random.randint(20, 200))
                if apply:
                    inv.quantity = total

            cat_key = item.category.value if item.category else "UK"
            dept_weights = CATEGORY_DEPT_WEIGHTS.get(cat_key, CATEGORY_DEPT_WEIGHTS["UK"])

            # 창고에 30-65% 보관
            wh_ratio = Decimal(str(round(random.uniform(0.30, 0.65), 4)))
            wh_qty = (total * wh_ratio).quantize(Decimal("1"))
            remaining = total - wh_qty

            # 부서 수: 1-3개
            num_depts = random.choices([1, 2, 3], weights=[4, 3, 1])[0]
            depts = weighted_sample(dept_weights, num_depts)

            if remaining > 0 and depts:
                dept_splits = split_quantity(remaining, len(depts))
            else:
                dept_splits = [Decimal(0)] * len(depts)

            # 불량 재고 (10% 확률)
            defective_qty = Decimal(0)
            if random.random() < 0.10:
                defective_ratio = Decimal(str(round(random.uniform(0.02, 0.08), 4)))
                defective_qty = max(Decimal(1), (total * defective_ratio).quantize(Decimal("1")))

            # 안전재고 설정 (70% 품목)
            min_stock: Decimal | None = None
            if random.random() < 0.70:
                if random.random() < 0.30:
                    # 30%는 현재 재고보다 높게 설정 → 경보 발생
                    factor = Decimal(str(round(random.uniform(1.1, 2.5), 2)))
                    min_stock = (total * factor).quantize(Decimal("1"))
                    safety_alert_preview += 1
                else:
                    # 70%는 현재 재고의 20-80%
                    factor = Decimal(str(round(random.uniform(0.20, 0.80), 2)))
                    min_stock = max(Decimal(1), (total * factor).quantize(Decimal("1")))
                safety_set += 1

            if not apply:
                if updated < 5:
                    print(f"[DRY] {item.item_name[:20]:<20} | 창고:{wh_qty:>6} | "
                          f"부서:{'+'.join(f'{d.value}:{q}' for d, q in zip(depts, dept_splits))} | "
                          f"불량:{defective_qty} | 안전:{min_stock}")
                updated += 1
                continue

            # ─── 실제 적용 ───
            inv.warehouse_qty = wh_qty
            item.min_stock = min_stock

            # 기존 InventoryLocation 삭제 후 재생성
            db.query(InventoryLocation).filter(
                InventoryLocation.item_id == item.item_id
            ).delete()

            for dept, qty in zip(depts, dept_splits):
                if qty <= 0:
                    continue
                loc = InventoryLocation(
                    item_id=item.item_id,
                    department=dept,
                    status=LocationStatusEnum.PRODUCTION,
                    quantity=qty,
                )
                db.add(loc)

            if defective_qty > 0:
                defect_dept = random.choice(depts) if depts else DepartmentEnum.ETC
                defect_loc = InventoryLocation(
                    item_id=item.item_id,
                    department=defect_dept,
                    status=LocationStatusEnum.DEFECTIVE,
                    quantity=defective_qty,
                )
                db.add(defect_loc)

            updated += 1
            if updated % 100 == 0:
                db.commit()
                print(f"  {updated}건 처리...")

        if apply:
            db.commit()
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
