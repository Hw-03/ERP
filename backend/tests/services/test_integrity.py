"""services/integrity.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import LocationStatusEnum
from app.services.integrity import check_inventory_consistency, repair_inventory_totals


D = Decimal


def test_check_consistency_no_mismatch(make_item, db_session):
    """warehouse 만 있고 위치 없음 + recorded == warehouse → 미스매치 0."""
    make_item(warehouse_qty=D("10"))
    mismatches = check_inventory_consistency(db_session)
    assert mismatches == []


def test_check_consistency_with_locations_balanced(make_item, make_location, db_session):
    """warehouse + Σ loc == recorded 인 정상 케이스."""
    item = make_item(warehouse_qty=D("4"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("3"))
    # quantity 가 처음에 warehouse_qty 와 동기화돼 있음 — 위치 추가 후 동기 안 했으므로 미스매치
    # 일치시키려면 quantity = wh + loc_sum = 7 로 설정
    from app.models import Inventory
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("7")
    db_session.flush()

    mismatches = check_inventory_consistency(db_session)
    assert mismatches == []


def test_check_consistency_quantity_too_high(make_item, db_session):
    """recorded > computed → 미스매치 + delta > 0."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("8")  # warehouse 5, loc 0 → computed=5, recorded=8
    db_session.flush()

    mismatches = check_inventory_consistency(db_session)
    assert len(mismatches) == 1
    m = mismatches[0]
    assert m.recorded_total == D("8")
    assert m.computed_total == D("5")
    assert m.delta == D("3")


def test_check_consistency_quantity_too_low(make_item, db_session):
    """recorded < computed → delta < 0."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("10"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("3")
    db_session.flush()

    mismatches = check_inventory_consistency(db_session)
    assert len(mismatches) == 1
    assert mismatches[0].delta == D("-7")


def test_repair_dry_run_does_not_write(make_item, db_session):
    """dry_run=True 면 mismatched 만 카운트, DB 변경 없음."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("9")
    db_session.flush()

    report = repair_inventory_totals(db_session, dry_run=True)
    assert report.dry_run is True
    assert report.mismatched == 1
    assert report.repaired == 0

    # DB 미변경
    inv2 = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv2.quantity == D("9")


def test_repair_actually_fixes(make_item, db_session):
    """dry_run=False 면 quantity 가 computed 로 갱신."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("5"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("12")
    db_session.flush()

    report = repair_inventory_totals(db_session, dry_run=False)
    assert report.repaired == 1

    inv2 = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv2.quantity == D("5")


def test_repair_samples_capped_at_20(make_item, db_session):
    """미스매치 25건 → samples 는 20건만."""
    from app.models import Inventory
    items = [make_item(name=f"X{i}", warehouse_qty=D("1")) for i in range(25)]
    for it in items:
        inv = db_session.query(Inventory).filter(Inventory.item_id == it.item_id).first()
        inv.quantity = D("99")
    db_session.flush()

    report = repair_inventory_totals(db_session, dry_run=True)
    assert report.mismatched == 25
    assert len(report.samples) == 20


# 5.5-D: 추가 5케이스 (edge / idempotent / orphan)


def test_check_consistency_zero_amounts_balanced(make_item, db_session):
    """모든 값이 0 인 새 품목은 mismatch 0 (무한 mismatch 회귀 방지)."""
    make_item(warehouse_qty=D("0"))
    assert check_inventory_consistency(db_session) == []


def test_check_consistency_with_orphan_location(make_item, make_location, db_session):
    """Inventory 가 있는데 InventoryLocation 도 있고, item 만 살아있으면 정합."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("2"))
    make_location(item.item_id, status=LocationStatusEnum.PRODUCTION, quantity=D("3"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("5")  # = 2 wh + 3 loc
    db_session.flush()
    assert check_inventory_consistency(db_session) == []


def test_repair_dry_run_idempotent(make_item, db_session):
    """dry_run 두 번 호출 시 같은 결과 (DB 미변경)."""
    from app.models import Inventory
    item = make_item(warehouse_qty=D("4"))
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("7")
    db_session.flush()

    r1 = repair_inventory_totals(db_session, dry_run=True)
    r2 = repair_inventory_totals(db_session, dry_run=True)
    assert r1.mismatched == r2.mismatched == 1
    assert r1.repaired == r2.repaired == 0


def test_repair_handles_inventory_with_no_locations(make_item, db_session):
    """Inventory 만 있고 location 0건 — quantity == warehouse 정합."""
    item = make_item(warehouse_qty=D("8"))
    # 처음 make_item 이 quantity=warehouse_qty=8 로 동기화 → mismatch 0
    report = repair_inventory_totals(db_session, dry_run=True)
    assert report.mismatched == 0
    assert report.repaired == 0


def test_check_consistency_multiple_locations_summed(make_item, make_location, db_session):
    """동일 item 의 여러 위치 (PRODUCTION + DEFECTIVE 등) 합산이 정확."""
    from app.models import DepartmentEnum, Inventory
    item = make_item(warehouse_qty=D("1"))
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=D("4"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.HIGH_VOLTAGE,
        status=LocationStatusEnum.PRODUCTION,
        quantity=D("2"),
    )
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=D("3"),
    )
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = D("10")  # 1 + 4 + 2 + 3
    db_session.flush()
    assert check_inventory_consistency(db_session) == []


# 5.6-G: DB-level 안전망 (CheckConstraint / UniqueConstraint) 보호 테스트


def test_inventory_location_check_constraint_blocks_negative(make_item, db_session):
    """InventoryLocation.quantity = -1 INSERT 시 CHECK 제약으로 IntegrityError.

    5.5-A 의 ck_invloc_quantity_nonneg 를 보호. 마이그레이션이 제거되거나
    create_all 이 CHECK 를 누락하면 이 테스트가 회귀를 잡는다.
    """
    from sqlalchemy.exc import IntegrityError
    from app.models import DepartmentEnum, InventoryLocation, LocationStatusEnum

    item = make_item(warehouse_qty=D("0"))
    bad = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=D("-1"),
    )
    db_session.add(bad)
    try:
        db_session.flush()
    except IntegrityError:
        db_session.rollback()
        return
    pytest.fail("CheckConstraint ck_invloc_quantity_nonneg 가 음수 INSERT 를 막지 못함")


def test_inventory_location_unique_constraint_blocks_duplicate(make_item, make_location, db_session):
    """동일 (item_id, department, status) INSERT 시 UNIQUE 제약 위반.

    5.5-A 의 uq_invloc_item_dept_status 를 보호. SchemaSync / create_all 회귀 검증.
    """
    from sqlalchemy.exc import IntegrityError
    from app.models import DepartmentEnum, InventoryLocation, LocationStatusEnum

    item = make_item(warehouse_qty=D("0"))
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=D("1"),
    )
    dup = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=D("2"),
    )
    db_session.add(dup)
    try:
        db_session.flush()
    except IntegrityError:
        db_session.rollback()
        return
    pytest.fail("UniqueConstraint uq_invloc_item_dept_status 가 중복 INSERT 를 막지 못함")
