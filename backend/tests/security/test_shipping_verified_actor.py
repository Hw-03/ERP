"""출하 mutation이 실제 operator session actor만 정본으로 쓰는지 검증한다."""

from __future__ import annotations

from decimal import Decimal

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    ShippingRequest,
)
from app.services.pin_auth import hash_pin


PIN = "2468"


def _employee(db_session, *, code: str, name: str) -> Employee:
    employee = Employee(
        employee_code=code,
        name=name,
        role="worker",
        department=DepartmentEnum.SHIPPING,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
        pin_hash=hash_pin(PIN),
        pin_requires_change=False,
    )
    db_session.add(employee)
    db_session.flush()
    return employee


def test_shipping_create_uses_cookie_actor_and_rejects_spoof_before_write(
    auth_client,
    db_session,
    make_item,
    make_bom,
) -> None:
    actor = _employee(db_session, code="SHIP-ACTOR-01", name="출하 세션 작업자")
    victim = _employee(db_session, code="SHIP-VICTIM-01", name="출하 위조 대상")
    af = make_item(name="출하 actor AF", process_type_code="AF")
    pa = make_item(name="출하 actor PA", process_type_code="PA")
    pf = make_item(name="출하 actor PF", process_type_code="PF")
    make_bom(pa.item_id, af.item_id, Decimal("1"))
    make_bom(pf.item_id, pa.item_id, Decimal("1"))
    db_session.commit()

    login = auth_client.post(
        "/api/operator-session",
        json={"employee_id": str(actor.employee_id), "pin": PIN},
    )
    assert login.status_code == 200, login.text

    spoofed_body = auth_client.post(
        "/api/shipping/requests",
        json={
            "base_pf_item_id": str(pf.item_id),
            "requested_by_name": victim.name,
        },
    )
    assert spoofed_body.status_code == 403, spoofed_body.text
    assert spoofed_body.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert db_session.query(ShippingRequest).count() == 0

    spoofed_header = auth_client.post(
        "/api/shipping/requests",
        headers={"X-MES-Employee-Code": victim.employee_code},
        json={"base_pf_item_id": str(pf.item_id)},
    )
    assert spoofed_header.status_code == 403, spoofed_header.text
    assert spoofed_header.json()["detail"]["code"] == "ACTOR_MISMATCH"
    assert db_session.query(ShippingRequest).count() == 0

    created = auth_client.post(
        "/api/shipping/requests",
        json={"base_pf_item_id": str(pf.item_id)},
    )
    assert created.status_code == 201, created.text
    assert created.json()["requested_by_name"] == actor.name
    db_session.expire_all()
    assert db_session.query(ShippingRequest).one().requested_by_name == actor.name
