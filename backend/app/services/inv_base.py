"""inv_base.py — Inventory / InventoryLocation 기반 헬퍼 + 부서 매핑.

다른 inv_*.py 모듈이 이 모듈에만 의존하며, 역방향 import 없음.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional
import uuid

from sqlalchemy.orm import Session

from app.database import _is_sqlite
from app.models import (
    DepartmentEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
)


# ---------------------------------------------------------------------------
# process_type_code → 부서 자동 매핑 (PRODUCE 결과물 적재용)
# ---------------------------------------------------------------------------
PROCESS_TYPE_TO_DEPT: dict[str, DepartmentEnum] = {
    "TA": DepartmentEnum.TUBE,
    "TF": DepartmentEnum.TUBE,
    "HA": DepartmentEnum.HIGH_VOLTAGE,
    "HF": DepartmentEnum.HIGH_VOLTAGE,
    "VA": DepartmentEnum.VACUUM,
    "VF": DepartmentEnum.VACUUM,
    "NA": DepartmentEnum.TUNING,
    "NF": DepartmentEnum.TUNING,
    "AA": DepartmentEnum.ASSEMBLY,
    "AF": DepartmentEnum.ASSEMBLY,
    "PA": DepartmentEnum.SHIPPING,
    "PF": DepartmentEnum.SHIPPING,
}


def dept_for_process_type(process_type_code: Optional[str]) -> Optional[DepartmentEnum]:
    """PRODUCE 결과 자동 적재 부서. R 시리즈/매핑 없으면 None (warehouse fallback)."""
    if not process_type_code:
        return None
    return PROCESS_TYPE_TO_DEPT.get(process_type_code)


def get_or_create_inventory(db: Session, item_id: uuid.UUID) -> Inventory:
    """읽기 전용 경로용 — 락 없이 조회/생성."""
    inv = db.query(Inventory).filter(Inventory.item_id == item_id).first()
    if inv is None:
        inv = Inventory(
            item_id=item_id,
            quantity=Decimal("0"),
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
        db.add(inv)
        db.flush()
    return inv


def _lock_inventory(db: Session, item_id: uuid.UUID) -> Inventory:
    """쓰기 경로용 — PostgreSQL: FOR UPDATE 행 잠금. SQLite: 일반 SELECT."""
    q = db.query(Inventory).filter(Inventory.item_id == item_id)
    if not _is_sqlite:
        q = q.with_for_update()
    inv = q.first()
    if inv is None:
        inv = Inventory(
            item_id=item_id,
            quantity=Decimal("0"),
            warehouse_qty=Decimal("0"),
            pending_quantity=Decimal("0"),
        )
        db.add(inv)
        db.flush()
    return inv


def _lock_location(
    db: Session,
    item_id: uuid.UUID,
    dept: DepartmentEnum,
    status: LocationStatusEnum,
) -> InventoryLocation:
    """쓰기 경로용 — PostgreSQL: FOR UPDATE 행 잠금. SQLite: 일반 SELECT."""
    q = db.query(InventoryLocation).filter(
        InventoryLocation.item_id == item_id,
        InventoryLocation.department == dept,
        InventoryLocation.status == status,
    )
    if not _is_sqlite:
        q = q.with_for_update()
    loc = q.first()
    if loc is None:
        loc = InventoryLocation(
            item_id=item_id,
            department=dept,
            status=status,
            quantity=Decimal("0"),
        )
        db.add(loc)
        db.flush()
    return loc


def _get_or_create_location(
    db: Session,
    item_id: uuid.UUID,
    dept: DepartmentEnum,
    status: LocationStatusEnum,
) -> InventoryLocation:
    """읽기 전용 경로용 — 락 없이 조회/생성. 하위 호환성 유지."""
    loc = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == status,
        )
        .first()
    )
    if loc is None:
        loc = InventoryLocation(
            item_id=item_id,
            department=dept,
            status=status,
            quantity=Decimal("0"),
        )
        db.add(loc)
        db.flush()
    return loc


def lock_inventories(db: Session, item_ids: list[uuid.UUID]) -> dict[uuid.UUID, Inventory]:
    """여러 품목을 한 번에 잠금 — production.py 등 다품목 동시 처리용.

    PostgreSQL: FOR UPDATE. SQLite: 일반 SELECT.
    없는 품목은 포함되지 않으므로 호출자가 누락 여부를 처리해야 한다.
    """
    if not item_ids:
        return {}
    q = db.query(Inventory).filter(Inventory.item_id.in_(item_ids))
    if not _is_sqlite:
        q = q.with_for_update()
    return {inv.item_id: inv for inv in q.order_by(Inventory.item_id).all()}
