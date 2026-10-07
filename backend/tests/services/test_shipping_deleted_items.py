"""삭제된 품목의 신규 출하 작업은 차단하고 이전 작업 취소는 허용한다."""

from datetime import datetime
from decimal import Decimal

import pytest

from app.models import DepartmentEnum, Employee, InventoryOperation, ShippingAllocation, ShippingRequest
from app.services import shipping as shipping_svc
from app.services import shipping_actions


def _request(db_session, make_item, make_bom, make_location):
    child = make_item(name="deleted-shipping-AF", process_type_code="AF")
    pa = make_item(name="deleted-shipping-PA", process_type_code="PA")
    pf = make_item(name="deleted-shipping-PF", process_type_code="PF")
    make_bom(pa.item_id, child.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    make_location(pf.item_id, department=DepartmentEnum.SHIPPING, quantity=Decimal("3"))
    actor = Employee(employee_code="DELETED-SHIPPING", name="QA actor", role="staff", department="출하")
    db_session.add(actor)
    db_session.flush()
    req = shipping_actions.create_request(db_session, {"base_pf_item_id": pf.item_id, "invoice_number": "QA-DELETED"})
    return req, pf, actor


def test_deleted_pf_rejected_before_request_is_created(db_session, make_item):
    item = make_item(name="deleted-new-request", process_type_code="PF")
    item.deleted_at = datetime.utcnow()
    db_session.commit()
    with pytest.raises(shipping_svc.ShippingError, match="삭제"):
        shipping_actions.create_request(db_session, {"base_pf_item_id": item.item_id})
    assert db_session.query(ShippingRequest).count() == 0


def test_stale_deleted_request_cannot_prepare_or_change_stock(db_session, make_item, make_bom, make_location):
    req, pf, actor = _request(db_session, make_item, make_bom, make_location)
    pf.deleted_at = datetime.utcnow()
    db_session.commit()
    with pytest.raises(shipping_svc.ShippingError, match="삭제"):
        shipping_actions.prepare_complete(db_session, req.request_id, "QA-SN", prepared_by_employee_id=actor.employee_id, prepared_by_name=actor.name)
    assert req.status.value == "PREPARING"
    assert db_session.query(ShippingAllocation).count() == 0
    assert db_session.query(InventoryOperation).count() == 0


def test_deleted_prepared_item_blocks_pickup_but_allows_prepare_cancel(db_session, make_item, make_bom, make_location):
    req, pf, actor = _request(db_session, make_item, make_bom, make_location)
    shipping_actions.prepare_complete(db_session, req.request_id, "QA-SN", prepared_by_employee_id=actor.employee_id, prepared_by_name=actor.name)
    pf.deleted_at = datetime.utcnow()
    db_session.commit()
    with pytest.raises(shipping_svc.ShippingError, match="삭제"):
        shipping_actions.pickup_complete(db_session, req.request_id, actor=actor)
    assert req.status.value == "PREPARED"
    shipping_actions.prepare_cancel(db_session, req.request_id, "QA cancel", actor=actor)
    assert req.status.value == "PREPARING"
    assert all(row.status == "RELEASED" for row in db_session.query(ShippingAllocation))
    assert shipping_svc.get_request(db_session, req.request_id).base_pf_item.deleted_at is not None
