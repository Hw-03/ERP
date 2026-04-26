"""services/integrity.py 단위 테스트."""

from __future__ import annotations

from decimal import Decimal

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
