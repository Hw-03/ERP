"""services/inv_defective.py 회귀 그물 단위 테스트.

현재 동작을 고정한다 (서비스 코드는 수정하지 않음).
검증 초점:
  - mark_defective / unmark_defective: 총량 불변 (위치만 이동)
  - scrap_defective / return_to_supplier / scrap_normal / return_to_supplier_from_normal: 총량 감소
  - source = warehouse / production 분기
  - 필수인자 누락·재고 부족 시 ValueError
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models import DepartmentEnum, Inventory, InventoryLocation, LocationStatusEnum
from app.services import inv_defective as svc
from app.services.inv_defective import DefectSource, NormalSource, ReasonContext

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY
TUBE = DepartmentEnum.TUBE


# ──────────────────────────── helpers ────────────────────────────

def _inv(db, item_id) -> Inventory:
    # 서비스가 inv.quantity 를 세션 객체에 set 하되 flush 하지 않은 상태일 수 있다.
    # expire_all 하면 그 미반영 값이 날아가므로, flush 로 밀어넣은 뒤 조회한다.
    db.flush()
    return db.query(Inventory).filter(Inventory.item_id == item_id).first()


def _total(db, item_id) -> Decimal:
    return _inv(db, item_id).quantity


def _warehouse(db, item_id) -> Decimal:
    return _inv(db, item_id).warehouse_qty


def _loc_qty(db, item_id, status, dept=ASSEMBLY) -> Decimal:
    loc = (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == status,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


def _prod(db, item_id, dept=ASSEMBLY) -> Decimal:
    return _loc_qty(db, item_id, LocationStatusEnum.PRODUCTION, dept)


def _defective(db, item_id, dept=ASSEMBLY) -> Decimal:
    return _loc_qty(db, item_id, LocationStatusEnum.DEFECTIVE, dept)


def _defective_loc(db, item_id, dept=ASSEMBLY) -> InventoryLocation:
    return (
        db.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
        )
        .first()
    )


# ──────────────────────────── mark_defective ────────────────────────────

def test_mark_defective_from_warehouse_total_invariant(make_item, db_session):
    """창고 출처 불량 등록: warehouse_qty 차감 + DEFECTIVE 증가, 총량 불변."""
    item = make_item(warehouse_qty=D("10"))
    before_total = _total(db_session, item.item_id)

    svc.mark_defective(
        db_session, item.item_id, D("3"),
        DefectSource(kind="warehouse", target_dept=ASSEMBLY),
    )

    assert _warehouse(db_session, item.item_id) == D("7")
    assert _defective(db_session, item.item_id) == D("3")
    assert _total(db_session, item.item_id) == before_total  # 위치만 이동, 총량 불변


def test_mark_defective_from_production_total_invariant(make_item, make_location, db_session):
    """생산 출처 불량 등록: 부서 PRODUCTION 차감 + DEFECTIVE 증가, 총량 불변."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("8"))
    # 총량 재동기화를 위해 한 번 sync 시킨다 (등록 자체가 _sync_total 호출).
    svc.mark_defective(
        db_session, item.item_id, D("5"),
        DefectSource(kind="production", target_dept=ASSEMBLY, source_dept=ASSEMBLY),
    )

    assert _prod(db_session, item.item_id) == D("3")       # 8 - 5
    assert _defective(db_session, item.item_id) == D("5")
    # 총량 = warehouse(0) + PRODUCTION(3) + DEFECTIVE(5) = 8 (불변)
    assert _total(db_session, item.item_id) == D("8")


def test_mark_defective_production_cross_dept_source(make_item, make_location, db_session):
    """생산 출처 부서(TUBE)와 불량 대상 부서(ASSEMBLY) 분리 가능."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=TUBE,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("6"))

    svc.mark_defective(
        db_session, item.item_id, D("2"),
        DefectSource(kind="production", target_dept=ASSEMBLY, source_dept=TUBE),
    )

    assert _prod(db_session, item.item_id, dept=TUBE) == D("4")
    assert _defective(db_session, item.item_id, dept=ASSEMBLY) == D("2")
    assert _total(db_session, item.item_id) == D("6")  # 불변


def test_mark_defective_sets_defective_at(make_item, db_session):
    """등록 시 defective_at 타임스탬프가 채워진다."""
    item = make_item(warehouse_qty=D("4"))
    svc.mark_defective(
        db_session, item.item_id, D("1"),
        DefectSource(kind="warehouse", target_dept=ASSEMBLY),
    )
    loc = _defective_loc(db_session, item.item_id)
    assert loc is not None
    assert loc.defective_at is not None


def test_mark_defective_qty_zero_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("5"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.mark_defective(
            db_session, item.item_id, D("0"),
            DefectSource(kind="warehouse", target_dept=ASSEMBLY),
        )


def test_mark_defective_production_missing_source_dept_raises(make_item, db_session):
    """source=production 인데 source_dept 누락 → ValueError."""
    item = make_item(warehouse_qty=D("5"))
    with pytest.raises(ValueError, match="source_dept"):
        svc.mark_defective(
            db_session, item.item_id, D("1"),
            DefectSource(kind="production", target_dept=ASSEMBLY, source_dept=None),
        )


def test_mark_defective_unknown_source_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("5"))
    with pytest.raises(ValueError, match="source"):
        svc.mark_defective(
            db_session, item.item_id, D("1"),
            DefectSource(kind="floor", target_dept=ASSEMBLY),
        )


def test_mark_defective_warehouse_insufficient_raises(make_item, db_session):
    """창고 가용 재고 부족 (pending 고려) → ValueError, 변동 없음."""
    item = make_item(warehouse_qty=D("3"))
    with pytest.raises(ValueError, match="부족"):
        svc.mark_defective(
            db_session, item.item_id, D("5"),
            DefectSource(kind="warehouse", target_dept=ASSEMBLY),
        )


# ──────────────────────────── unmark_defective ────────────────────────────

def test_unmark_defective_total_invariant(make_item, make_location, db_session):
    """불량 → 정상 복귀: DEFECTIVE 차감 + 같은 부서 PRODUCTION 증가, 총량 불변."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("5"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("2"))

    svc.unmark_defective(
        db_session, item.item_id, D("3"), ASSEMBLY,
        ReasonContext(category="오판정", memo="재검사 정상", actor="홍길동"),
    )

    assert _defective(db_session, item.item_id) == D("2")  # 5 - 3
    assert _prod(db_session, item.item_id) == D("5")        # 2 + 3
    assert _total(db_session, item.item_id) == D("7")       # 불변 (5+2)


def test_unmark_defective_clears_defective_at(make_item, make_location, db_session):
    """전량 복귀 시 defective_at NULL 로 초기화."""
    from datetime import datetime
    item = make_item(warehouse_qty=D("0"))
    loc = make_location(item.item_id, department=ASSEMBLY,
                        status=LocationStatusEnum.DEFECTIVE, quantity=D("4"))
    loc.defective_at = datetime.utcnow()
    db_session.flush()

    svc.unmark_defective(
        db_session, item.item_id, D("4"), ASSEMBLY,
        ReasonContext(category="오판정", memo="m", actor="a"),
    )
    assert _defective_loc(db_session, item.item_id).defective_at is None


def test_unmark_defective_qty_zero_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("0"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.unmark_defective(
            db_session, item.item_id, D("0"), ASSEMBLY,
            ReasonContext(category="x", memo="m", actor="a"),
        )


def test_unmark_defective_insufficient_raises(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("2"))
    with pytest.raises(ValueError, match="부족"):
        svc.unmark_defective(
            db_session, item.item_id, D("5"), ASSEMBLY,
            ReasonContext(category="오판정", memo="m", actor="a"),
        )


# ──────────────────────────── scrap_defective ────────────────────────────

def test_scrap_defective_total_decreases(make_item, make_location, db_session):
    """불량 폐기: DEFECTIVE 차감 + 총량 감소."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("6"))
    # 등록을 통해 총량 동기화 효과를 만들기 위해 scrap 호출 (scrap 이 _sync_total).
    svc.scrap_defective(
        db_session, item.item_id, D("4"), ASSEMBLY,
        ReasonContext(category="폐기", memo="파손", actor="홍길동"),
    )

    assert _defective(db_session, item.item_id) == D("2")  # 6 - 4
    assert _total(db_session, item.item_id) == D("2")       # 총량 감소 (6 → 2)


def test_scrap_defective_qty_zero_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("0"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.scrap_defective(
            db_session, item.item_id, D("0"), ASSEMBLY,
            ReasonContext(category="x", memo="m", actor="a"),
        )



def test_scrap_defective_insufficient_raises(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("1"))
    with pytest.raises(ValueError, match="부족"):
        svc.scrap_defective(
            db_session, item.item_id, D("5"), ASSEMBLY,
            ReasonContext(category="폐기", memo="m", actor="a"),
        )


# ──────────────────────────── return_to_supplier ────────────────────────────

def test_return_to_supplier_total_decreases(make_item, make_location, db_session):
    """공급업체 반품: 부서 DEFECTIVE 차감 + 총량 감소."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("7"))

    svc.return_to_supplier(db_session, item.item_id, D("3"), ASSEMBLY)

    assert _defective(db_session, item.item_id) == D("4")  # 7 - 3
    assert _total(db_session, item.item_id) == D("4")       # 총량 감소


def test_return_to_supplier_qty_zero_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("0"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.return_to_supplier(db_session, item.item_id, D("0"), ASSEMBLY)


def test_return_to_supplier_insufficient_raises(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("2"))
    with pytest.raises(ValueError, match="부족"):
        svc.return_to_supplier(db_session, item.item_id, D("5"), ASSEMBLY)


# ──────────────────────────── scrap_normal ────────────────────────────

def test_scrap_normal_warehouse_total_decreases(make_item, db_session):
    """정상 창고 폐기: warehouse_qty 차감 + 총량 감소."""
    item = make_item(warehouse_qty=D("10"))
    svc.scrap_normal(
        db_session, item.item_id, D("4"),
        NormalSource(kind="warehouse", dept_or_warehouse=ASSEMBLY),
        ReasonContext(category="폐기", memo="불용", actor="a"),
    )
    assert _warehouse(db_session, item.item_id) == D("6")
    assert _total(db_session, item.item_id) == D("6")  # 총량 감소


def test_scrap_normal_production_total_decreases(make_item, make_location, db_session):
    """정상 생산 폐기: 부서 PRODUCTION 차감 + 총량 감소."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=TUBE,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("9"))
    svc.scrap_normal(
        db_session, item.item_id, D("5"),
        NormalSource(kind="production", dept_or_warehouse=TUBE),
        ReasonContext(category="폐기", memo="불용", actor="a"),
    )
    assert _prod(db_session, item.item_id, dept=TUBE) == D("4")  # 9 - 5
    assert _total(db_session, item.item_id) == D("4")             # 총량 감소


def test_scrap_normal_qty_zero_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("10"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.scrap_normal(
            db_session, item.item_id, D("0"),
            NormalSource(kind="warehouse", dept_or_warehouse=ASSEMBLY),
            ReasonContext(category="폐기", memo="m", actor="a"),
        )


def test_scrap_normal_unknown_source_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("10"))
    with pytest.raises(ValueError, match="source"):
        svc.scrap_normal(
            db_session, item.item_id, D("1"),
            NormalSource(kind="floor", dept_or_warehouse=ASSEMBLY),
            ReasonContext(category="폐기", memo="m", actor="a"),
        )


def test_scrap_normal_warehouse_insufficient_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("3"))
    with pytest.raises(ValueError, match="부족"):
        svc.scrap_normal(
            db_session, item.item_id, D("5"),
            NormalSource(kind="warehouse", dept_or_warehouse=ASSEMBLY),
            ReasonContext(category="폐기", memo="m", actor="a"),
        )


def test_scrap_normal_production_insufficient_raises(make_item, make_location, db_session):
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=TUBE,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("1"))
    with pytest.raises(ValueError, match="부족"):
        svc.scrap_normal(
            db_session, item.item_id, D("5"),
            NormalSource(kind="production", dept_or_warehouse=TUBE),
            ReasonContext(category="폐기", memo="m", actor="a"),
        )


# ──────────────────────────── return_to_supplier_from_normal ────────────────────────────

def test_return_from_normal_warehouse_total_decreases(make_item, db_session):
    """정상 창고 직접 반품: warehouse_qty 차감 + 총량 감소."""
    item = make_item(warehouse_qty=D("8"))
    svc.return_to_supplier_from_normal(
        db_session, item.item_id, D("3"),
        NormalSource(kind="warehouse", dept_or_warehouse=ASSEMBLY, supplier_name="공급사"),
        ReasonContext(category="반품", memo="m", actor="a"),
    )
    assert _warehouse(db_session, item.item_id) == D("5")
    assert _total(db_session, item.item_id) == D("5")  # 총량 감소


def test_return_from_normal_production_total_decreases(make_item, make_location, db_session):
    """정상 생산 직접 반품: 부서 PRODUCTION 차감 + 총량 감소."""
    item = make_item(warehouse_qty=D("0"))
    make_location(item.item_id, department=ASSEMBLY,
                  status=LocationStatusEnum.PRODUCTION, quantity=D("6"))
    svc.return_to_supplier_from_normal(
        db_session, item.item_id, D("2"),
        NormalSource(kind="production", dept_or_warehouse=ASSEMBLY, supplier_name="공급사"),
        ReasonContext(category="반품", memo="m", actor="a"),
    )
    assert _prod(db_session, item.item_id) == D("4")  # 6 - 2
    assert _total(db_session, item.item_id) == D("4")  # 총량 감소


def test_return_from_normal_qty_zero_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("8"))
    with pytest.raises(ValueError, match="0보다 커야"):
        svc.return_to_supplier_from_normal(
            db_session, item.item_id, D("0"),
            NormalSource(kind="warehouse", dept_or_warehouse=ASSEMBLY, supplier_name="s"),
            ReasonContext(category="반품", memo="m", actor="a"),
        )


def test_return_from_normal_unknown_source_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("8"))
    with pytest.raises(ValueError, match="source"):
        svc.return_to_supplier_from_normal(
            db_session, item.item_id, D("1"),
            NormalSource(kind="floor", dept_or_warehouse=ASSEMBLY, supplier_name="s"),
            ReasonContext(category="반품", memo="m", actor="a"),
        )


def test_return_from_normal_warehouse_insufficient_raises(make_item, db_session):
    item = make_item(warehouse_qty=D("2"))
    with pytest.raises(ValueError, match="부족"):
        svc.return_to_supplier_from_normal(
            db_session, item.item_id, D("5"),
            NormalSource(kind="warehouse", dept_or_warehouse=ASSEMBLY, supplier_name="s"),
            ReasonContext(category="반품", memo="m", actor="a"),
        )
