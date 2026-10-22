"""저장 예정 효과가 실제 입출고 실행 준비와 같은 의미를 갖는지 검증한다."""
from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app.models import BOM, DepartmentEnum, Inventory, InventoryLocation, TransactionLog
from app.services import io_dispatch
from app.services.work_reservation_errors import WorkReservationError
from tests.services.test_io_dispatch import _build_batch, _issue_bom_auto_token, _make_employee


def _plan(db_session, batch) -> dict:
    from app.services.io_effective_plan import build_effective_plan

    return build_effective_plan(db_session, batch)


def _process_batch(db_session, make_item, make_location, make_bom, *, sub_type, scenario):
    parent = make_item(name="계획 상위", process_type_code="AF")
    child = make_item(name="계획 하위", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal("2"))
    for item in (parent, child):
        make_location(item.item_id, quantity=Decimal("20"))
    requester = _make_employee(db_session)
    produce = sub_type == "produce"
    batch = _build_batch(
        db_session, requester=requester, sub_type=sub_type, status="draft",
        source_item_id=parent.item_id,
        lines=[
            {"item_id": parent.item_id, "origin": "direct", "quantity": Decimal("1"),
             "direction": "in" if produce else "out",
             "from_bucket": "none" if produce else "production",
             "from_department": None if produce else DepartmentEnum.ASSEMBLY.value,
             "to_bucket": "production" if produce else "none",
             "to_department": DepartmentEnum.ASSEMBLY.value if produce else None},
            {"item_id": child.item_id, "origin": "bom_auto",
             "quantity": Decimal("3" if scenario == "custom" else "2"),
             "included": scenario != "excluded",
             "direction": "out" if produce else "in",
             "from_bucket": "production" if produce else "none",
             "from_department": DepartmentEnum.ASSEMBLY.value if produce else None,
             "to_bucket": "none" if produce else "production",
             "to_department": None if produce else DepartmentEnum.ASSEMBLY.value},
        ],
    )
    batch.notes = "계획과 실행 일치 검증"
    child_line = next(line for line in batch.bundles[0].lines if line.origin == "bom_auto")
    _issue_bom_auto_token(db_session, batch, child_line)
    if scenario == "exempt":
        child.bom_stock_exempt = True
    db_session.flush()
    return batch, requester, parent, child, child_line


def _line_state(batch) -> list[dict]:
    return [{column.key: getattr(line, column.key) for column in line.__table__.columns}
            for bundle in batch.bundles for line in bundle.lines]


@pytest.mark.parametrize("sub_type", ["produce", "disassemble"])
@pytest.mark.parametrize("scenario", ["standard", "custom", "excluded", "exempt"])
def test_process_effects_match_execution_without_mutating_draft(
    db_session, make_item, make_location, make_bom, sub_type, scenario,
):
    batch, requester, parent, child, _ = _process_batch(
        db_session, make_item, make_location, make_bom, sub_type=sub_type, scenario=scenario,
    )
    original = _line_state(batch)
    stock = [(row.item_id, row.quantity, row.pending_quantity)
             for model in (Inventory, InventoryLocation) for row in db_session.query(model).all()]

    plan = _plan(db_session, batch)

    assert json.loads(json.dumps(plan)) == plan
    assert plan["version"] == 1
    assert _line_state(batch) == original
    assert not db_session.new and not db_session.dirty and not db_session.deleted
    assert db_session.query(TransactionLog).count() == 0
    assert [(row.item_id, row.quantity, row.pending_quantity)
            for model in (Inventory, InventoryLocation) for row in db_session.query(model).all()] == stock
    effects = {effect["item_id"]: effect for effect in plan["effects"]}
    parent_kind, child_kind = (("in", "out") if sub_type == "produce" else ("out", "in"))
    if scenario == "standard":
        assert {item_id: effect["kind"] for item_id, effect in effects.items()} == {
            str(parent.item_id): parent_kind, str(child.item_id): child_kind,
        }
    elif scenario == "custom":
        assert [(effect["item_id"], effect["kind"], effect["quantity"]) for effect in plan["effects"]] == [
            (str(child.item_id), parent_kind, 3),
        ]
    elif scenario == "excluded":
        assert plan["effects"] == []
    else:
        assert [(effect["item_id"], effect["kind"]) for effect in plan["effects"]] == [
            (str(parent.item_id), parent_kind),
        ]

    io_dispatch._execute_submission(db_session, requester=requester, batch=batch)

    executed = io_dispatch._included_lines(batch)
    assert {effect["operation_line_id"] for effect in plan["effects"]} == {
        str(line.line_id) for line in executed
    }
    for line in executed:
        effect = next(effect for effect in plan["effects"] if effect["operation_line_id"] == str(line.line_id))
        assert effect["kind"] == line.direction
        assert effect["quantity"] == line.quantity
        assert effect["from"] == (None if line.from_bucket == "none" else {
            "bucket": line.from_bucket, "department": line.from_department,
        })
        assert effect["to"] == (None if line.to_bucket == "none" else {
            "bucket": line.to_bucket, "department": line.to_department,
        })


def test_custom_bom_rejects_unverified_lineage_without_mutation(
    db_session, make_item, make_location, make_bom,
):
    batch, _, _, _, child_line = _process_batch(
        db_session, make_item, make_location, make_bom, sub_type="produce", scenario="custom",
    )
    child_line.bom_auto_token = "invalid"
    db_session.flush()
    original = _line_state(batch)

    with pytest.raises(ValueError, match="원본 정보"):
        _plan(db_session, batch)

    assert _line_state(batch) == original
    assert not db_session.dirty


def test_stale_bom_with_valid_lineage_keeps_custom_child_effect(
    db_session, make_item, make_location, make_bom,
):
    batch, _, parent, child, _ = _process_batch(
        db_session, make_item, make_location, make_bom, sub_type="disassemble", scenario="standard",
    )
    db_session.query(BOM).filter(BOM.parent_item_id == parent.item_id).delete()
    db_session.flush()

    plan = _plan(db_session, batch)

    assert [(effect["item_id"], effect["kind"], effect["quantity"]) for effect in plan["effects"]] == [
        (str(child.item_id), "out", 2),
    ]


@pytest.mark.parametrize("direction,source,target,expected", [
    ("move", ("warehouse", None), ("production", "조립"), "move"),
    ("defective", ("production", "조립"), ("defective", "조립"), "move"),
    ("adjust", ("none", None), ("warehouse", None), "in"),
    ("adjust", ("warehouse", None), ("none", None), "out"),
])
def test_effect_kind_follows_physical_endpoints(db_session, make_item, direction, source, target, expected):
    item = make_item(warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session)
    batch = _build_batch(db_session, requester=requester, sub_type="warehouse_adjust_in",
                         work_type="warehouse_adjust", source_kind="direct_item", lines=[
        {"item_id": item.item_id, "quantity": Decimal("2"), "direction": direction,
         "from_bucket": source[0], "from_department": source[1],
         "to_bucket": target[0], "to_department": target[1]},
    ])

    effect = _plan(db_session, batch)["effects"][0]

    assert effect["kind"] == expected
    assert effect["from"] == (None if source[0] == "none" else {"bucket": source[0], "department": source[1]})
    assert effect["to"] == (None if target[0] == "none" else {"bucket": target[0], "department": target[1]})


def test_plan_keeps_same_cell_lines_and_does_not_net_future_input(db_session, make_item):
    item = make_item()
    requester = _make_employee(db_session)
    batch = _build_batch(db_session, requester=requester, sub_type="warehouse_adjust_out",
                         work_type="warehouse_adjust", source_kind="direct_item", lines=[
        {"item_id": item.item_id, "quantity": Decimal("5"), "direction": "out",
         "from_bucket": "warehouse", "to_bucket": "none"},
        {"item_id": item.item_id, "quantity": Decimal("3"), "direction": "out",
         "from_bucket": "warehouse", "to_bucket": "none"},
        {"item_id": item.item_id, "quantity": Decimal("8"), "direction": "in",
         "from_bucket": "none", "to_bucket": "warehouse"},
    ])

    plan = _plan(db_session, batch)

    assert len(plan["effects"]) == 3
    assert len({effect["effect_id"] for effect in plan["effects"]}) == 3
    assert sum(effect["quantity"] for effect in plan["effects"] if effect["from"]) == 8


@pytest.mark.parametrize("bad_source,same_cell,fractional,code", [
    (True, False, False, "WORK_UNSUPPORTED_SOURCE"),
    (False, True, False, "VALIDATION_ERROR"),
    (False, False, True, "VALIDATION_ERROR"),
])
def test_plan_rejects_unsupported_or_invalid_physical_effects(
    db_session, make_item, bad_source, same_cell, fractional, code,
):
    item = make_item()
    requester = _make_employee(db_session)
    batch = _build_batch(db_session, requester=requester, sub_type="supplier_return",
                         work_type="defect", source_kind="direct_item", lines=[
        {"item_id": item.item_id, "quantity": Decimal("1"),
         "direction": "move" if same_cell else "out",
         "from_bucket": "defective" if bad_source else "production",
         "from_department": DepartmentEnum.ASSEMBLY.value,
         "to_bucket": "production" if same_cell else "none",
         "to_department": DepartmentEnum.ASSEMBLY.value if same_cell else None},
    ])
    if fractional:
        batch.bundles[0].lines[0].quantity = Decimal("1.5")

    with pytest.raises(WorkReservationError) as error:
        _plan(db_session, batch)

    assert error.value.code == code
    assert error.value.status_code == 422


def test_fingerprint_is_stable_and_ignores_display_and_shortage(db_session, make_item):
    item = make_item()
    requester = _make_employee(db_session)
    batch = _build_batch(db_session, requester=requester, sub_type="warehouse_adjust_in",
                         work_type="warehouse_adjust", source_kind="direct_item", lines=[
        {"item_id": item.item_id, "quantity": Decimal("2"), "direction": "adjust",
         "from_bucket": "none", "to_bucket": "warehouse"},
    ])
    first = _plan(db_session, batch)
    line = batch.bundles[0].lines[0]
    line.item_name_snapshot = "다른 표시 이름"
    line.mes_code_snapshot = "다른 표시 코드"
    line.shortage = Decimal("99")

    second = _plan(db_session, batch)

    assert first["fingerprint"] == second["fingerprint"]
    assert first["effects"][0]["effect_id"] == second["effects"][0]["effect_id"]
    line.quantity = Decimal("3")
    assert _plan(db_session, batch)["fingerprint"] != first["fingerprint"]


def test_internal_use_fingerprint_tracks_approval_split(db_session, make_item):
    item = make_item(process_type_code="AR")
    requester = _make_employee(db_session, department=DepartmentEnum.AS)
    batch = _build_batch(db_session, requester=requester, sub_type="internal_use_out",
                         work_type="internal_use", source_kind="direct_item", source_item_id=item.item_id,
                         to_department=DepartmentEnum.AS.value, lines=[
        {"item_id": item.item_id, "quantity": Decimal("2"), "direction": "out",
         "from_bucket": "production", "from_department": DepartmentEnum.ASSEMBLY.value,
         "to_bucket": "none", "to_department": DepartmentEnum.AS.value},
    ])
    first = _plan(db_session, batch)
    requester.as_research_approver = True
    db_session.flush()

    second = _plan(db_session, batch)

    assert first["effects"] == second["effects"]
    assert first["fingerprint"] != second["fingerprint"]
