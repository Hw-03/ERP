"""routers/dept_adjustment.py 통합 테스트."""

from __future__ import annotations

from decimal import Decimal

from app.models import DepartmentEnum, Employee, EmployeeLevelEnum, LocationStatusEnum
from app.services.pin_auth import DEFAULT_PIN_HASH

D = Decimal
ASSEMBLY = DepartmentEnum.ASSEMBLY


def _make_operator(db_session, *, code: str = "DA01") -> Employee:
    emp = Employee(
        employee_code=code,
        name="부서조정담당",
        role=f"{ASSEMBLY.value}/staff",
        department=ASSEMBLY,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active="true",
        pin_hash=DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _prod_qty(db_session, item_id, dept=ASSEMBLY) -> Decimal:
    from app.models import InventoryLocation
    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item_id,
            InventoryLocation.department == dept,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    return loc.quantity if loc else D("0")


# ──────────────────────────── bom-template ────────────────────────────

def test_get_bom_template_production(client, db_session, make_item, make_bom):
    parent = make_item(name="AF")
    child = make_item(name="AR")
    make_bom(parent.item_id, child.item_id, D("2"))
    db_session.commit()

    resp = client.get(
        "/api/dept-adjustment/bom-template",
        params={"item_id": str(parent.item_id), "sub_type": "production", "quantity": "1"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["sub_type"] == "production"
    lines = data["lines"]
    directions = {l["direction"] for l in lines}
    assert "out" in directions
    assert "in" in directions

    in_lines = [l for l in lines if l["direction"] == "in"]
    assert in_lines[0]["item_id"] == str(parent.item_id)


def test_get_bom_template_disassembly(client, db_session, make_item, make_bom):
    parent = make_item(name="AF")
    child = make_item(name="AR")
    make_bom(parent.item_id, child.item_id, D("3"))
    db_session.commit()

    resp = client.get(
        "/api/dept-adjustment/bom-template",
        params={"item_id": str(parent.item_id), "sub_type": "disassembly", "quantity": "2"},
    )
    assert resp.status_code == 200
    lines = resp.json()["lines"]
    out_lines = [l for l in lines if l["direction"] == "out"]
    in_lines = [l for l in lines if l["direction"] == "in"]
    assert out_lines[0]["item_id"] == str(parent.item_id)
    assert float(out_lines[0]["quantity"]) == 2.0
    assert float(in_lines[0]["quantity"]) == 6.0


def test_get_bom_template_item_not_found(client):
    import uuid
    resp = client.get(
        "/api/dept-adjustment/bom-template",
        params={"item_id": str(uuid.uuid4()), "sub_type": "production"},
    )
    assert resp.status_code == 404


def test_get_bom_template_invalid_sub_type(client, db_session, make_item):
    item = make_item(name="X")
    db_session.commit()
    resp = client.get(
        "/api/dept-adjustment/bom-template",
        params={"item_id": str(item.item_id), "sub_type": "correction"},
    )
    assert resp.status_code == 400


# ──────────────────────────── expand-component ────────────────────────────

def test_expand_component_endpoint(client, db_session, make_item, make_bom):
    parent = make_item(name="B")
    child = make_item(name="C")
    make_bom(parent.item_id, child.item_id, D("4"))
    db_session.commit()

    resp = client.post(
        "/api/dept-adjustment/expand-component",
        json={
            "item_id": str(parent.item_id),
            "quantity": 2,
            "department": "조립",
            "direction": "out",
        },
    )
    assert resp.status_code == 200
    lines = resp.json()
    assert len(lines) == 1
    assert lines[0]["item_id"] == str(child.item_id)
    assert float(lines[0]["quantity"]) == 8.0


def test_expand_component_no_children_422(client, db_session, make_item):
    item = make_item(name="leaf")
    db_session.commit()
    resp = client.post(
        "/api/dept-adjustment/expand-component",
        json={"item_id": str(item.item_id), "quantity": 1, "department": "조립", "direction": "out"},
    )
    assert resp.status_code == 422


# ──────────────────────────── submit ────────────────────────────

def test_submit_production_api(client, db_session, make_item, make_location):
    comp = make_item(name="AR")
    result = make_item(name="AF")
    make_location(comp.item_id, department=ASSEMBLY, quantity=D("5"))
    operator = _make_operator(db_session, code="DAP1")
    db_session.commit()

    resp = client.post(
        "/api/dept-adjustment/submit",
        json={
            "sub_type": "production",
            "operator_name": "작업자1",
            "operator_employee_code": operator.employee_code,
            "lines": [
                {"item_id": str(comp.item_id),   "direction": "out", "quantity": 2, "department": "조립"},
                {"item_id": str(result.item_id),  "direction": "in",  "quantity": 1, "department": "조립"},
            ],
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["success"] is True
    assert data["processed_count"] == 2
    assert len(data["transaction_ids"]) == 2

    assert _prod_qty(db_session, comp.item_id) == D("3")
    assert _prod_qty(db_session, result.item_id) == D("1")


def test_submit_correction_api(client, db_session, make_item, make_location):
    item = make_item(name="X")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("10"))
    operator = _make_operator(db_session, code="DAC1")
    db_session.commit()

    resp = client.post(
        "/api/dept-adjustment/submit",
        json={
            "sub_type": "correction",
            "operator_employee_code": operator.employee_code,
            "lines": [
                {"item_id": str(item.item_id), "direction": "out", "quantity": 3,
                 "department": "조립", "reason": "실사 차이"},
            ],
        },
    )
    assert resp.status_code == 201
    assert resp.json()["processed_count"] == 1
    assert _prod_qty(db_session, item.item_id) == D("7")




def test_submit_requires_operator_employee_code(client, db_session, make_item, make_location):
    item = make_item(name="NOOP")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("10"))
    db_session.commit()

    resp = client.post(
        "/api/dept-adjustment/submit",
        json={
            "sub_type": "correction",
            "lines": [
                {"item_id": str(item.item_id), "direction": "out", "quantity": 1, "department": ASSEMBLY.value},
            ],
        },
    )

    assert resp.status_code == 422
    assert _prod_qty(db_session, item.item_id) == D("10")
def test_submit_stock_shortage_422(client, db_session, make_item, make_location):
    item = make_item(name="Y")
    make_location(item.item_id, department=ASSEMBLY, quantity=D("1"))
    operator = _make_operator(db_session, code="DAS1")
    db_session.commit()

    resp = client.post(
        "/api/dept-adjustment/submit",
        json={
            "sub_type": "correction",
            "operator_employee_code": operator.employee_code,
            "lines": [{"item_id": str(item.item_id), "direction": "out", "quantity": 99, "department": "조립"}],
        },
    )
    assert resp.status_code == 422
    assert resp.json()["detail"]["code"] == "UNPROCESSABLE"


def test_submit_invalid_sub_type_422(client, db_session, make_item):
    item = make_item(name="Z")
    db_session.commit()
    resp = client.post(
        "/api/dept-adjustment/submit",
        json={
            "sub_type": "invalid_value",
            "lines": [{"item_id": str(item.item_id), "direction": "in", "quantity": 1, "department": "조립"}],
        },
    )
    assert resp.status_code == 422


def test_submit_empty_lines_422(client):
    resp = client.post(
        "/api/dept-adjustment/submit",
        json={"sub_type": "correction", "lines": []},
    )
    assert resp.status_code == 422
