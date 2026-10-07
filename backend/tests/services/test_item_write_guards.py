"""New inventory work rejects inactive items while reversal remains available."""
from datetime import datetime
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum, Employee, Inventory, LocationStatusEnum, RequestBucketEnum,
    StockRequest, StockRequestStatusEnum, StockRequestTypeEnum, TransactionLog,
)
from app.services import inventory, sr_draft, sr_execution
from app.services.inv_effect import apply_effect_reverse
from app.services.pin_auth import DEFAULT_PIN_HASH
from app.services.sr_validation import LineInput
from app.schemas import ProductionReceiptRequest
from app.services.production_receipt import execute_production_receipt, ProductionBadRequest

D = Decimal


@pytest.mark.parametrize("deleted", ["parent", "inventory_child"])
def test_production_deleted_item_is_bad_request_and_rolls_back_all(
    db_session, make_item, make_bom, make_location, deleted,
):
    parent = make_item(process_type_code="PF")
    good = make_item()
    bad = make_item()
    for component in (good, bad):
        make_bom(parent.item_id, component.item_id, D("1"))
        make_location(component.item_id, department=DepartmentEnum.TUBE, quantity=D("5"))
    (parent if deleted == "parent" else bad).deleted_at = datetime.utcnow()
    db_session.commit()
    with pytest.raises(ProductionBadRequest, match="삭제"):
        execute_production_receipt(
            db_session, ProductionReceiptRequest(item_id=parent.item_id, quantity=1),
            parent, "guard", None,
        )
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Inventory).filter(Inventory.item_id == parent.item_id).one().quantity == 0


@pytest.mark.parametrize("operation", [
    "receive", "consume", "transfer_out", "transfer_in", "department_consume",
    "department_transfer", "reserve", "reserve_location", "consume_pending", "adjust",
    "defective_receive", "defective_return",
])
def test_deleted_item_blocks_new_inventory_effect(db_session, make_item, make_location, operation):
    item = make_item(warehouse_qty=D("10"), pending=D("2"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=D("10"))
    make_location(item.item_id, department=DepartmentEnum.TUBE,
                  status=LocationStatusEnum.DEFECTIVE, quantity=D("10"))
    item.deleted_at = datetime.utcnow()
    db_session.flush()
    calls = {
        "receive": lambda: inventory.receive_confirmed(db_session, item.item_id, D("1")),
        "consume": lambda: inventory.consume_warehouse(db_session, item.item_id, D("1")),
        "transfer_out": lambda: inventory.transfer_to_production(db_session, item.item_id, D("1"), DepartmentEnum.TUBE),
        "transfer_in": lambda: inventory.transfer_to_warehouse(db_session, item.item_id, D("1"), DepartmentEnum.TUBE),
        "department_consume": lambda: inventory.consume_from_department(db_session, item.item_id, D("1"), DepartmentEnum.TUBE),
        "department_transfer": lambda: inventory.transfer_between_departments(db_session, item.item_id, D("1"), DepartmentEnum.TUBE, DepartmentEnum.ASSEMBLY),
        "reserve": lambda: inventory.reserve(db_session, item.item_id, D("1")),
        "reserve_location": lambda: inventory.reserve_location(db_session, item.item_id, D("1"), department=DepartmentEnum.TUBE.value, status=LocationStatusEnum.PRODUCTION),
        "consume_pending": lambda: inventory.consume_pending(db_session, item.item_id, D("1")),
        "adjust": lambda: inventory.adjust_warehouse(db_session, item.item_id, D("12")),
        "defective_receive": lambda: inventory.receive_defective(db_session, item.item_id, D("1"), DepartmentEnum.TUBE, None),
        "defective_return": lambda: inventory.return_to_supplier(db_session, item.item_id, D("1"), DepartmentEnum.TUBE),
    }
    with pytest.raises(ValueError, match="삭제"):
        calls[operation]()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == 10
    assert inv.pending_quantity == 2


def test_deleted_item_allows_reservation_release_and_transaction_reverse(db_session, make_item, make_location):
    item = make_item(warehouse_qty=D("10"))
    loc = make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=D("10"))
    inventory.reserve(db_session, item.item_id, D("2"))
    inventory.reserve_location(db_session, item.item_id, D("3"),
                               department=DepartmentEnum.TUBE.value, status=LocationStatusEnum.PRODUCTION)
    item.deleted_at = datetime.utcnow()
    db_session.flush()
    inventory.release(db_session, item.item_id, D("2"))
    inventory.release_location(db_session, item.item_id, D("3"),
                               department=DepartmentEnum.TUBE.value, status=LocationStatusEnum.PRODUCTION)
    apply_effect_reverse(db_session, item.item_id, [{"scope": "warehouse", "delta": -2}])
    db_session.flush()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    assert inv.warehouse_qty == 12
    assert inv.pending_quantity == 0
    assert loc.pending_quantity == 0


def _raw_draft(db_session, item):
    employee = Employee(employee_code="GUARD", name="Guard", role="warehouse",
                        department=DepartmentEnum.WAREHOUSE, warehouse_role="primary",
                        pin_hash=DEFAULT_PIN_HASH, is_active="true")
    db_session.add(employee)
    db_session.flush()
    line = LineInput(item_id=item.item_id, quantity=D("2"),
                     from_bucket=RequestBucketEnum.NONE, to_bucket=RequestBucketEnum.WAREHOUSE,
                     from_department=None, to_department=None)
    request = sr_draft.upsert_draft_request(
        db_session, requester=employee, request_type=StockRequestTypeEnum.RAW_RECEIVE,
        lines_input=[line], reference_no=None, notes=None,
    )
    return employee, line, request


def test_deleted_item_draft_can_still_be_removed(db_session, make_item):
    item = make_item()
    employee, _line, request = _raw_draft(db_session, item)
    item.deleted_at = datetime.utcnow()
    db_session.flush()
    sr_draft.delete_draft_request(db_session, request_id=request.request_id,
                                   requester_employee_id=employee.employee_id)
    assert db_session.query(StockRequest).count() == 0


@pytest.mark.parametrize("entry", ["replace_draft", "submit_draft", "final_execution"])
@pytest.mark.parametrize("invalid", ["non_raw", "deleted"])
def test_stock_request_rechecks_stale_items_without_mutation(db_session, make_item, entry, invalid):
    item = make_item()
    employee, line, request = _raw_draft(db_session, item)
    if invalid == "deleted":
        item.deleted_at = datetime.utcnow()
    else:
        item.process_type_code = "TF"
    db_session.flush()
    with pytest.raises(ValueError, match="삭제" if invalid == "deleted" else "원자재"):
        if entry == "replace_draft":
            sr_draft.upsert_draft_request(
                db_session, requester=employee, request_type=request.request_type,
                lines_input=[line], reference_no="changed", notes="changed",
            )
        elif entry == "submit_draft":
            sr_draft.submit_draft_request(db_session, request_id=request.request_id,
                                           requester_employee_id=employee.employee_id)
        else:
            sr_execution._execute_all_lines(db_session, request, request.lines,
                                             operator_name=employee.name, approver=employee)
    assert request.status == StockRequestStatusEnum.DRAFT
    assert request.reference_no is None
    assert len(request.lines) == 1
    assert db_session.query(StockRequest).count() == 1
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one().quantity == 0
