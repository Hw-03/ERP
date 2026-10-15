"""튜브 원자재 입출고와 업체 작업범위 계약."""
import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import DepartmentEnum, Employee, Inventory, InventoryLocation, Item, Supplier, TransactionLog
from app.schemas import IoSubmitRequest
from app.schemas.io import IoPreviewTarget
from app.services import io_actions, io_draft, io_preview


def _actor(db):
    actor = Employee(employee_code=uuid.uuid4().hex[:12], name="튜브 담당", role="worker", department="튜브", warehouse_role="none", is_active=True)
    db.add(actor)
    db.flush()
    return actor


def _payload(db, make_item, *, outbound=False):
    actor = _actor(db)
    item = make_item()
    supplier = Supplier(name="튜브 업체", normalized_name="튜브 업체", scope="tube")
    db.add(supplier)
    db.flush()
    subtype = "tube_outbound_supplier" if outbound else "tube_receive_supplier"
    preview = io_preview.preview(db, work_type="tube_material", sub_type=subtype, targets=[IoPreviewTarget(item_id=item.item_id, quantity=2)])
    payload = IoSubmitRequest(requester_employee_id=actor.employee_id, supplier_id=supplier.supplier_id, notes="외부 발송" if outbound else None, **{key: preview[key] for key in ("work_type", "sub_type", "bundles")})
    return actor, item, supplier, payload


def test_tube_receive_uses_department_and_receive_type(db_session, make_item):
    _, item, supplier, payload = _payload(db_session, make_item)
    result = io_actions.submit(db_session, payload)
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert result["status"] == "completed"
    assert result["requires_approval"] is False
    assert inv.quantity == 2 and inv.warehouse_qty == 0
    assert log.transaction_type.value == "RECEIVE"
    assert log.department == "튜브"
    assert log.supplier_id == supplier.supplier_id


@pytest.mark.parametrize("invalid", ["department", "inactive", "item", "route", "scope", "bom", "reason"])
def test_tube_boundaries_reject_tampering(db_session, make_item, make_location, invalid):
    actor, item, supplier, payload = _payload(db_session, make_item, outbound=True)
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=10)
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 10
    if invalid == "department":
        actor.department = "조립"
    elif invalid == "inactive":
        actor.is_active = False
    elif invalid == "item":
        item.process_type_code = "HR"
    elif invalid == "route":
        payload.bundles[0].lines[0].from_department = "조립"
    elif invalid == "scope":
        supplier.scope = "warehouse"
    elif invalid == "bom":
        payload.bundles[0].source_kind = "bom_parent"
    else:
        payload.notes = " "
    db_session.flush()
    with pytest.raises((ValueError, PermissionError)):
        io_actions.submit(db_session, payload)
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 0


def test_tube_draft_empty_allowed_but_supplier_required(db_session):
    actor = _actor(db_session)
    supplier = Supplier(name="초안 업체", normalized_name="초안 업체", scope="tube")
    db_session.add(supplier)
    db_session.flush()
    payload = IoSubmitRequest(requester_employee_id=actor.employee_id, work_type="tube_material", sub_type="tube_receive_supplier", supplier_id=supplier.supplier_id, bundles=[])
    assert io_draft.save_draft(db_session, payload)["status"] == "draft"
    payload.supplier_id = None
    with pytest.raises(ValueError, match="공급업체"):
        io_draft.save_draft(db_session, payload)


def test_tube_supplier_management_scope_permissions(client, db_session):
    actor = _actor(db_session)
    body = {"requester_employee_id": str(actor.employee_id), "name": "튜브 업체", "scope": "tube"}
    created = client.post("/api/suppliers", json=body)
    assert created.status_code == 201
    assert created.json()["scope"] == "tube"
    assert client.post("/api/suppliers", json=body).status_code == 409
    assert client.get(f"/api/suppliers?requester_employee_id={actor.employee_id}&scope=tube&include_inactive=true").status_code == 200
    assert client.get(f"/api/suppliers?requester_employee_id={actor.employee_id}").json() == []
    body["scope"] = "warehouse"
    assert client.post("/api/suppliers", json=body).status_code == 403


def test_tube_outbound_uses_normal_available_stock(db_session, make_item, make_location):
    _, item, _, payload = _payload(db_session, make_item, outbound=True)
    location = make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=5)
    location.pending_quantity = 3
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 5
    db_session.flush()
    result = io_actions.submit(db_session, payload)
    assert result["status"] == "completed"
    assert location.quantity == 3
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert log.transaction_type.value == "MATERIAL_OUT"
    assert log.department == "튜브"


def test_tube_operation_history_and_daily_labels(db_session, make_item):
    from app.models import IoBatch, Item
    from app.routers.daily_work_reports import _operation_for
    from app.routers.inventory._tx_filters import _department_filter, _history_list_operation_label_expr, _operation_keys_filter
    _, item, _, payload = _payload(db_session, make_item)
    result = io_actions.submit(db_session, payload)
    batch = db_session.get(IoBatch, result["batch"]["batch_id"])
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert _operation_for(log, batch) == ("tube_material", "튜브 원자재")
    query = db_session.query(_history_list_operation_label_expr()).select_from(TransactionLog).join(Item, Item.item_id == TransactionLog.item_id).outerjoin(IoBatch, IoBatch.batch_id == TransactionLog.operation_batch_id)
    assert query.scalar() == "튜브 원자재 입고"
    assert _operation_keys_filter("tube_material") is not None
    assert query.filter(_operation_keys_filter("tube_material")).count() == 1
    assert query.filter(_operation_keys_filter("warehouse")).count() == 0
    assert query.filter(_department_filter("튜브")).count() == 1
    assert query.filter(_department_filter("창고")).count() == 0


@pytest.mark.parametrize("boundary", ["preview", "draft", "submit", "existing_draft"])
def test_disabled_tube_department_cannot_start_or_submit(db_session, make_item, client, boundary):
    from app.models import Department
    actor, item, _, payload = _payload(db_session, make_item)
    draft = io_draft.save_draft(db_session, payload) if boundary == "existing_draft" else None
    db_session.add(Department(name="튜브", io_enabled=False))
    db_session.flush()
    if boundary == "preview":
        response = client.post("/api/io/preview", json={"work_type": "tube_material", "sub_type": payload.sub_type, "requester_employee_id": str(actor.employee_id), "targets": [{"item_id": str(item.item_id), "quantity": 1}]})
        assert response.status_code == 403
    else:
        with pytest.raises(PermissionError):
            if boundary == "draft":
                io_draft.save_draft(db_session, payload)
            elif boundary == "submit":
                io_actions.submit(db_session, payload)
            else:
                io_actions.submit_existing_draft(db_session, batch_id=draft["batch_id"], requester_employee_id=actor.employee_id)


@pytest.mark.parametrize("code,department,expected", [("TR", "튜브", "tube"), ("TA", "튜브", "warehouse"), ("TR", "창고", "warehouse")])
def test_defect_return_scope_is_server_record_based(client, db_session, make_item, code, department, expected):
    from app.models import DefectQuarantineRecord
    actor = _actor(db_session)
    item = make_item(process_type_code=code)
    record = DefectQuarantineRecord(item_id=item.item_id, department=department, original_quantity=3, remaining_quantity=3, is_legacy=True)
    db_session.add(record)
    db_session.flush()
    response = client.get("/api/defects/locations")
    row = next(row for row in response.json() if row["record_id"] == str(record.record_id))
    assert row["process_type_code"] == code
    assert row["return_supplier_scope"] == expected


def test_tube_defect_return_requires_tube_supplier_at_all_boundaries(client, db_session, make_item, make_location):
    from app.models import DefectQuarantineRecord, LocationStatusEnum
    actor = _actor(db_session)
    item = make_item()
    make_location(item.item_id, department=DepartmentEnum.TUBE, status=LocationStatusEnum.DEFECTIVE, quantity=4)
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 4
    record = DefectQuarantineRecord(item_id=item.item_id, department="튜브", original_quantity=4, remaining_quantity=4)
    warehouse = Supplier(name="창고", normalized_name="창고")
    tube = Supplier(name="튜브", normalized_name="튜브", scope="tube")
    db_session.add_all([record, warehouse, tube])
    db_session.flush()
    payload = {"requester_employee_id": str(actor.employee_id), "request_type": "defect_return", "supplier_id": str(warehouse.supplier_id), "reason_category": "외관 불량", "lines": [{"record_id": str(record.record_id), "item_id": str(item.item_id), "quantity": 1, "from_bucket": "defective", "from_department": "튜브", "to_bucket": "none"}]}
    db_session.commit()
    for response in (
        client.post("/api/stock-requests", json=payload),
        client.put("/api/stock-requests/draft", json=payload),
    ):
        assert response.status_code == 422, response.text
        assert "공급업체 작업범위" in response.json()["detail"]["message"]
    assert record.remaining_quantity == 4
    assert db_session.query(InventoryLocation).filter_by(item_id=item.item_id).one().quantity == 4
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 0
    payload["supplier_id"] = str(tube.supplier_id)
    response = client.post("/api/stock-requests", json=payload)
    assert response.status_code == 201, response.json()
    assert record.remaining_quantity == 3
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).one().supplier_id == tube.supplier_id


@pytest.mark.parametrize("code,has_record", [("TA", True), ("TR", False)], ids=["non-tr-record", "recordless-legacy"])
def test_tube_defect_return_preserves_warehouse_supplier_fallback(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], code: str, has_record: bool,
) -> None:
    """실제 TR 원건 외의 튜브 반품은 기존 warehouse 업체 계약을 보존한다."""
    from app.models import DefectQuarantineRecord, LocationStatusEnum

    actor = _actor(db_session)
    item = make_item(process_type_code=code, warehouse_qty=7)
    normal = make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=6)
    defective = make_location(item.item_id, department=DepartmentEnum.TUBE, status=LocationStatusEnum.DEFECTIVE, quantity=4)
    inventory = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    inventory.quantity = 17
    supplier = Supplier(name="레거시 반품 업체", normalized_name="레거시 반품 업체", scope="warehouse")
    record = DefectQuarantineRecord(item_id=item.item_id, department="튜브", original_quantity=4, remaining_quantity=4) if has_record else None
    db_session.add(supplier)
    if record is not None:
        db_session.add(record)
    db_session.flush()
    line = {"item_id": str(item.item_id), "quantity": 1, "from_bucket": "defective", "from_department": "튜브", "to_bucket": "none"}
    if record is not None:
        line["record_id"] = str(record.record_id)
    payload = {"requester_employee_id": str(actor.employee_id), "request_type": "defect_return", "supplier_id": str(supplier.supplier_id), "reason_category": "외관 불량", "lines": [line]}
    db_session.commit()

    response = client.post("/api/stock-requests", json=payload)

    assert response.status_code == 201, response.text
    assert response.json()["status"] == "completed"
    db_session.expire_all()
    assert defective.quantity == 3
    assert normal.quantity == 6
    assert inventory.warehouse_qty == 7
    assert inventory.quantity == 16
    if record is not None:
        assert record.remaining_quantity == 3
    else:
        assert db_session.query(DefectQuarantineRecord).filter_by(item_id=item.item_id).count() == 0
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    assert log.transaction_type.value == "SUPPLIER_RETURN"
    assert log.department == "튜브"
    assert log.supplier_id == supplier.supplier_id
    assert log.supplier_name_snapshot == supplier.name
    assert log.defect_quarantine_record_id == (record.record_id if record is not None else None)


@pytest.mark.parametrize("boundary", ["create", "draft"])
def test_other_department_defect_return_rejects_valid_warehouse_supplier_without_writes(
    client: TestClient, db_session: Session, make_item: Callable[..., Item],
    make_location: Callable[..., InventoryLocation], boundary: str,
) -> None:
    """업체 scope가 올바른 조립 원건도 부서 제한으로 쓰기 전에 거부한다."""
    from app.models import (
        DefectInventoryMovement, DefectQuarantineRecord, InventoryOperation,
        LocationStatusEnum, StockRequest, StockRequestLine,
    )

    actor = _actor(db_session)
    actor.department = "조립"
    item = make_item(process_type_code="AR")
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, status=LocationStatusEnum.DEFECTIVE, quantity=4)
    db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 4
    record = DefectQuarantineRecord(item_id=item.item_id, department="조립", original_quantity=4, remaining_quantity=4)
    supplier = Supplier(name="정상 창고 업체", normalized_name="정상 창고 업체", scope="warehouse")
    db_session.add_all([record, supplier])
    db_session.flush()
    payload = {"requester_employee_id": str(actor.employee_id), "request_type": "defect_return", "supplier_id": str(supplier.supplier_id), "reason_category": "외관 불량", "lines": [{"record_id": str(record.record_id), "item_id": str(item.item_id), "quantity": 1, "from_bucket": "defective", "from_department": "조립", "to_bucket": "none"}]}
    db_session.commit()
    tables = [model.__table__ for model in (
        Inventory, InventoryLocation, DefectQuarantineRecord, TransactionLog,
        InventoryOperation, DefectInventoryMovement, StockRequest, StockRequestLine,
    )]
    before = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}

    response = (client.post("/api/stock-requests", json=payload) if boundary == "create"
                else client.put("/api/stock-requests/draft", json=payload))

    assert response.status_code == 422, response.text
    assert "창고 또는 튜브" in response.json()["detail"]["message"]
    db_session.expire_all()
    after = {table.name: [tuple(row) for row in db_session.execute(table.select()).all()] for table in tables}
    assert after == before


def test_tube_outbound_shortage_is_atomic_with_multiple_items(db_session, make_item, make_location):
    actor, first, supplier, payload = _payload(db_session, make_item, outbound=True)
    first_location = make_location(first.item_id, department=DepartmentEnum.TUBE, quantity=5)
    db_session.query(Inventory).filter_by(item_id=first.item_id).one().quantity = 5
    second = make_item()
    second_location = make_location(second.item_id, department=DepartmentEnum.TUBE, quantity=5)
    second_location.pending_quantity = 4
    db_session.query(Inventory).filter_by(item_id=second.item_id).one().quantity = 5
    second_bundle = payload.bundles[0].model_copy(deep=True)
    second_bundle.bundle_id = uuid.uuid4()
    second_bundle.source_item_id = second.item_id
    second_bundle.lines[0].line_id = uuid.uuid4()
    second_bundle.lines[0].item_id = second.item_id
    payload.bundles.append(second_bundle)
    db_session.commit()
    with pytest.raises(ValueError, match="재고 부족"):
        io_actions.submit(db_session, payload)
    assert first_location.quantity == 5 and second_location.quantity == 5
    assert db_session.query(TransactionLog).filter(TransactionLog.item_id.in_([first.item_id, second.item_id])).count() == 0


def test_tube_submit_retry_is_idempotent(client, db_session, make_item):
    _, item, _, payload = _payload(db_session, make_item)
    payload.client_request_id = "tube-material-retry"
    body = payload.model_dump(mode="json")
    first = client.post("/api/io/submit", json=body)
    second = client.post("/api/io/submit", json=body)
    assert first.status_code == second.status_code == 201
    assert first.json()["batch"]["batch_id"] == second.json()["batch"]["batch_id"]
    assert db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity == 2
    assert db_session.query(TransactionLog).filter_by(item_id=item.item_id).count() == 1


def test_tube_receive_cancellation_restores_only_department_stock(db_session, make_item):
    from app.models import SystemSetting, InventoryLocation
    from app.services import inventory_operation_cancellation
    actor, item, _, payload = _payload(db_session, make_item)
    db_session.add(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00"))
    db_session.flush()
    io_actions.submit(db_session, payload)
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    plan = inventory_operation_cancellation.preview_cancellation(db_session, log.operation_id)
    assert plan.can_cancel, plan.blockers
    inventory_operation_cancellation.cancel_operation(db_session, operation_id=log.operation_id, canceller=actor, reason="입고 취소", plan_hash=plan.plan_hash)
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    location = db_session.query(InventoryLocation).filter_by(item_id=item.item_id, department="튜브").one()
    assert inv.quantity == inv.warehouse_qty == 0
    assert location.quantity == 0


@pytest.mark.parametrize("outbound", [False, True])
def test_tube_material_summary_counts_department_activity(client, db_session, make_item, make_location, outbound):
    _, item, _, payload = _payload(db_session, make_item, outbound=outbound)
    if outbound:
        make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=5)
        db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 5
        db_session.flush()
    io_actions.submit(db_session, payload)
    response = client.get("/api/inventory/transactions/summary")
    assert response.status_code == 200
    assert response.json() == {"total": 1, "warehouse_count": 0, "dept_count": 1, "adjust_count": 0, "department_counts": {"튜브": 1}}


def test_tube_receive_rejects_warehouse_quantity_correction(client, db_session, make_item):
    from app.models import InventoryLocation, TransactionEditLog
    actor, item, _, payload = _payload(db_session, make_item)
    io_actions.submit(db_session, payload)
    log = db_session.query(TransactionLog).filter_by(item_id=item.item_id).one()
    response = client.post(f"/api/inventory/transactions/{log.log_id}/quantity-correction", json={"quantity_change": 3, "reason": "수량 오기", "edited_by_employee_id": str(actor.employee_id), "edited_by_pin": "0000"})
    assert response.status_code == 422
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).one()
    location = db_session.query(InventoryLocation).filter_by(item_id=item.item_id, department="튜브").one()
    assert inv.quantity == location.quantity == 2
    assert inv.warehouse_qty == 0
    assert db_session.query(TransactionEditLog).filter_by(original_log_id=log.log_id).count() == 0


@pytest.mark.parametrize("outbound", [False, True])
def test_tube_display_groups_preserve_history_batch(client, db_session, make_item, make_location, outbound):
    _, item, _, payload = _payload(db_session, make_item, outbound=outbound)
    if outbound:
        make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=5)
        db_session.query(Inventory).filter_by(item_id=item.item_id).one().quantity = 5
        db_session.flush()
    io_actions.submit(db_session, payload)
    response = client.get("/api/inventory/transactions/display-groups")
    assert response.status_code == 200
    history_batch = response.json()["groups"][0]["logs"][0]["history_batch"]
    assert history_batch is not None
    assert history_batch["work_type"] == "tube_material"
    assert history_batch["sub_type"] == payload.sub_type
