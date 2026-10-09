"""Narrow snapshot scans keep all evidence and validating column processors."""

from dataclasses import asdict
from collections import Counter
from datetime import datetime
from decimal import Decimal
from typing import Any, Callable

import pytest
from sqlalchemy import DateTime, Enum, JSON, event, inspect
from sqlalchemy.orm import Query, Session, undefer

from app.models import (
    DefectInventoryMovement,
    DefectQuarantineRecord,
    Employee,
    Inventory,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    RequestBucketEnum,
    ShippingAllocation,
    ShippingRequest,
    StockRequest,
    StockRequestLine,
    StockRequestTypeEnum,
)
from app.services import inventory_integrity as integrity
from app.models.base import IntQuantity


# Explicit evidence plus Enum/DateTime/IntQuantity/JSON, including unused validators.
SNAPSHOT_FIELDS = {
    Inventory: {"inventory_id", "item_id", "quantity", "warehouse_qty", "pending_quantity", "updated_at"},
    InventoryLocation: {"location_id", "item_id", "department", "status", "quantity", "pending_quantity", "updated_at", "defective_at"},
    StockRequest: {"request_id", "request_code", "request_type", "status", "reserved_at", "submitted_at", "approved_at", "rejected_at", "department_approved_at", "as_research_approved_at", "cancelled_at", "completed_at", "created_at", "updated_at"},
    StockRequestLine: {"line_id", "request_id", "item_id", "quantity", "from_bucket", "from_department", "to_bucket", "status", "created_at"},
    ShippingRequest: {"request_id", "status", "finalization_mode", "request_quantity", "prepared_at", "picked_up_at", "cancelled_at", "created_at", "updated_at"},
    ShippingAllocation: {"allocation_id", "request_id", "item_id", "quantity", "department", "status", "created_at", "released_at", "consumed_at"},
    InventoryOperation: {"operation_id", "kind", "status", "effective_at", "contract_version", "reverses_operation_id", "created_at"},
    InventoryOperationEffect: {"effect_id", "operation_id", "effect_kind", "subject_type", "subject_id", "role", "before_state", "after_state", "created_at"},
    DefectInventoryMovement: {"movement_id", "operation_id", "quantity_delta", "effective_at", "created_at"},
}


class _OrmScalarRow:
    """Expose a full ORM row through the scalar snapshot reader's row contract."""

    def __init__(self, entity: Any, primary_key: str) -> None:
        self.entity = entity
        self.primary_key = primary_key

    def __getitem__(self, index: int) -> Any:
        assert index == 0
        return getattr(self.entity, self.primary_key)

    def __getattr__(self, name: str) -> Any:
        return getattr(self.entity, name)


def _full_width_oracle(query: Query, original_all: Callable[[Query], list[Any]]) -> list[Any]:
    """Use original full ORM scans for every projected snapshot model."""
    expressions = [entry["expr"] for entry in query.column_descriptions]
    for model, expected_fields in SNAPSHOT_FIELDS.items():
        if len(expressions) == 1 and expressions[0] is model:
            query = query.options(*(undefer(getattr(model, column.key)) for column in model.__table__.c))
            return original_all(query)
        if (len(expressions) == len(expected_fields)
                and all(getattr(expr, "class_", None) is model for expr in expressions)
                and {expr.key for expr in expressions} == expected_fields):
            primary_key = model.__mapper__.primary_key[0].key
            return [_OrmScalarRow(entity, primary_key) for entity in original_all(query.session.query(model))]
    return original_all(query)


def _operation(db: Session) -> InventoryOperation:
    """Keep an actual ORM representative alive for identity-state comparisons."""
    operation = InventoryOperation(
        kind=InventoryOperationKindEnum.BUSINESS,
        domain="inventory",
        action="receive",
        display_label="Snapshot width",
        actor_name="Tester",
        effective_at=datetime(2026, 10, 1),
        reason="Unused text must remain untouched in a live instance.",
    )
    db.add(operation)
    db.flush()
    return operation


@pytest.mark.parametrize("model,expected_fields", SNAPSHOT_FIELDS.items(), ids=lambda value: getattr(value, "__name__", None))
def test_snapshot_selects_evidence_and_all_validation_fields(
    db_session: Session, model: type, expected_fields: set[str],
) -> None:
    """Real cursor columns prove width without changing the full row population."""
    validating = {column.key for column in model.__table__.c if isinstance(column.type, (Enum, DateTime, IntQuantity, JSON))}
    assert validating | {column.key for column in model.__table__.primary_key} <= expected_fields
    selected: list[set[str]] = []

    def capture(_connection: Any, cursor: Any, statement: str, _parameters: Any, _context: Any, _many: bool) -> None:
        sql = " ".join(statement.split())
        if sql.endswith(f"FROM {model.__tablename__}"):
            prefix = f"{model.__tablename__}_"
            selected.append({column[0].removeprefix(prefix) for column in cursor.description})

    connection = db_session.connection()
    event.listen(connection, "after_cursor_execute", capture)
    try:
        integrity._collect_integrity_snapshot(db_session)
    finally:
        event.remove(connection, "after_cursor_execute", capture)
    assert selected == [expected_fields]


@pytest.mark.parametrize("state", ["loaded", "dirty", "expired"])
def test_snapshot_and_response_preserve_live_identity_values(
    db_session: Session, make_item: Callable[..., Any], monkeypatch: pytest.MonkeyPatch, state: str,
) -> None:
    """Keep ORM identity semantics while comparing against original full-width scans."""
    item = make_item(warehouse_qty=Decimal(5))
    inventory = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).one()
    operation = _operation(db_session)
    effect = InventoryOperationEffect(
        operation_id=operation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="StockRequest", subject_id="full-width-reference", role="REQUEST_STATUS",
        before_state={"status": "submitted"}, after_state={"status": "completed"},
    )
    db_session.add(effect)
    db_session.flush()
    if state == "dirty":
        inventory.quantity = Decimal(8)
        inventory.warehouse_qty = Decimal(8)
        operation.contract_version = 2
        operation.reason = "Pending unused text"
    elif state == "expired":
        db_session.expire(inventory)
        db_session.expire(operation)
    dirty_before = set(db_session.dirty)
    statements: list[str] = []

    def capture(_connection: Any, _cursor: Any, statement: str, _parameters: Any, _context: Any, _many: bool) -> None:
        statements.append(statement)

    connection = db_session.connection()
    event.listen(connection, "before_cursor_execute", capture)
    try:
        snapshot = integrity._collect_integrity_snapshot(db_session)
    finally:
        event.remove(connection, "before_cursor_execute", capture)
    assert len(statements) == 18  # Existing collections and two setting reads; no lazy refresh.
    assert db_session.get(Inventory, inventory.inventory_id) is inventory
    assert db_session.get(InventoryOperation, operation.operation_id) is operation
    assert not {"quantity", "warehouse_qty", "pending_quantity"} & inspect(inventory).unloaded
    assert not {"contract_version", "effective_at", "reverses_operation_id"} & inspect(operation).unloaded
    assert snapshot.inventories[0].quantity == Decimal(8 if state == "dirty" else 5)
    assert snapshot.operations[0].contract_version == (2 if state == "dirty" else 1)
    assert set(db_session.dirty) == dirty_before
    optimized = integrity.diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    original_all = Query.all

    def full_width(query: Query) -> list[Any]:
        """Restore the original fields on these exact ORM scans, keeping identity state."""
        return _full_width_oracle(query, original_all)

    monkeypatch.setattr(Query, "all", full_width)
    full_columns: dict[str, set[str]] = {}

    def capture_full(_connection: Any, cursor: Any, statement: str, _parameters: Any, _context: Any, _many: bool) -> None:
        sql = " ".join(statement.split())
        for model in SNAPSHOT_FIELDS:
            table = model.__tablename__
            if sql.endswith(f"FROM {table}"):
                full_columns[table] = {column[0].removeprefix(f"{table}_") for column in cursor.description}

    event.listen(connection, "after_cursor_execute", capture_full)
    try:
        full_snapshot = integrity._collect_integrity_snapshot(db_session)
    finally:
        event.remove(connection, "after_cursor_execute", capture_full)
    assert full_columns == {model.__tablename__: set(model.__table__.c.keys()) for model in SNAPSHOT_FIELDS}
    actual, expected = asdict(snapshot), asdict(full_snapshot)
    actual.pop("evaluated_at")
    expected.pop("evaluated_at")
    assert actual == expected
    full_response = integrity.diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    assert optimized == full_response
    assert set(db_session.dirty) == dirty_before
    if state == "dirty":
        assert operation.reason == "Pending unused text"


@pytest.mark.parametrize("column,value,error", [("kind", "invalid-kind", LookupError), ("created_at", "invalid-date", ValueError)])
def test_unused_operation_validation_errors_remain_visible(
    db_session: Session, column: str, value: str, error: type[Exception],
) -> None:
    """Fields absent from OperationState must still reject the same malformed raw values."""
    operation_id = _operation(db_session).operation_id.hex
    db_session.connection().exec_driver_sql(
        f"UPDATE inventory_operations SET {column} = ? WHERE operation_id = ?", (value, operation_id),
    )
    db_session.expunge_all()
    with pytest.raises(error):
        integrity._collect_integrity_snapshot(db_session)


def test_snapshot_reads_every_operation_effect_without_persistent_orm_hydration(db_session: Session) -> None:
    """A fresh identity map makes an ORM hydration regression visible at scale."""
    operations = [
        InventoryOperation(kind=InventoryOperationKindEnum.BUSINESS, domain="inventory",
                           action="receive", display_label="Snapshot", actor_name="Tester")
        for _ in range(40)
    ]
    db_session.add_all(operations)
    db_session.flush()
    effects = [
        InventoryOperationEffect(
            operation_id=operation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="StockRequest", subject_id=f"snapshot-{index}", role="REQUEST_STATUS",
            before_state={} if index == 0 else {"status": "submitted"},
            after_state={"status": "completed"},
        )
        for index, operation in enumerate(operations)
    ]
    db_session.add_all(effects)
    db_session.flush()
    operation_ids = {str(operation.operation_id) for operation in operations}
    effect_ids = {str(effect.effect_id) for effect in effects}
    db_session.expunge_all()
    original_operation_order = [str(row.operation_id) for row in db_session.query(InventoryOperation).all()]
    original_effect_order = [str(row.effect_id) for row in db_session.query(InventoryOperationEffect).all()]
    db_session.expunge_all()
    assert not any(isinstance(instance, (InventoryOperation, InventoryOperationEffect))
                   for instance in db_session.identity_map.values())

    hydrated: list[type] = []

    def record(_session: Session, instance: object) -> None:
        if isinstance(instance, (InventoryOperation, InventoryOperationEffect)):
            hydrated.append(type(instance))

    event.listen(db_session, "loaded_as_persistent", record)
    try:
        snapshot = integrity._collect_integrity_snapshot(db_session)
    finally:
        event.remove(db_session, "loaded_as_persistent", record)

    assert {row.operation_id for row in snapshot.operations} == operation_ids
    assert [row.operation_id for row in snapshot.operations] == original_operation_order
    assert {row.evidence_id for row in snapshot.operation_evidence
            if row.kind == "operation_effect"} == effect_ids
    assert [row.evidence_id for row in snapshot.operation_evidence
            if row.kind == "operation_effect"] == original_effect_order
    assert sum(row.valid for row in snapshot.operation_evidence
               if row.kind == "operation_effect") == 39
    assert all(isinstance(row.effective_at, datetime) for row in snapshot.operations)
    assert hydrated == []


def test_fresh_snapshot_avoids_six_orm_populations_and_matches_full_oracle(
    db_session: Session, make_item: Callable[..., Any], monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Populated scans must keep typed evidence and response without ORM hydration."""
    employee = Employee(employee_code="snapshot-width", name="Snapshot", role="admin", department="assembly")
    db_session.add(employee)
    db_session.flush()
    for index in range(5):
        item = make_item(name=f"Snapshot {index}", process_type_code="PF")
        request = StockRequest(
            requester_employee_id=employee.employee_id, requester_name="Snapshot",
            requester_department="assembly", request_type=StockRequestTypeEnum.RAW_SHIP,
        )
        shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
        record = DefectQuarantineRecord(
            item_id=item.item_id, department="assembly", original_quantity=1, remaining_quantity=1,
        )
        db_session.add_all((request, shipping, record))
        db_session.flush()
        operation = _operation(db_session)
        db_session.add_all((
            StockRequestLine(
                request_id=request.request_id, item_id=item.item_id, item_name_snapshot=item.item_name,
                quantity=1, from_bucket=RequestBucketEnum.WAREHOUSE, to_bucket=RequestBucketEnum.NONE,
            ),
            ShippingAllocation(
                request_id=shipping.request_id, item_id=item.item_id, quantity=1, department="assembly",
            ),
            DefectInventoryMovement(
                operation_id=operation.operation_id, record_id=record.record_id, item_id=item.item_id,
                department="assembly", movement_type="quarantine", quantity_delta=1,
                role="PRIMARY", actor_name="Snapshot",
            ),
        ))
    db_session.flush()
    db_session.expunge_all()
    selected_models = (Inventory, StockRequest, StockRequestLine, ShippingRequest,
                       ShippingAllocation, DefectInventoryMovement)
    hydrated: list[type] = []

    def record(_session: Session, instance: object) -> None:
        if isinstance(instance, selected_models):
            hydrated.append(type(instance))

    event.listen(db_session, "loaded_as_persistent", record)
    try:
        snapshot = integrity._collect_integrity_snapshot(db_session)
    finally:
        event.remove(db_session, "loaded_as_persistent", record)
    assert hydrated == []
    db_session.expunge_all()
    optimized = integrity.diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    db_session.expunge_all()
    original_all = Query.all
    monkeypatch.setattr(Query, "all", lambda query: _full_width_oracle(query, original_all))
    event.listen(db_session, "loaded_as_persistent", record)
    try:
        full_snapshot = integrity._collect_integrity_snapshot(db_session)
    finally:
        event.remove(db_session, "loaded_as_persistent", record)
    actual, expected = asdict(snapshot), asdict(full_snapshot)
    actual.pop("evaluated_at")
    expected.pop("evaluated_at")
    assert actual == expected
    assert all(Counter(hydrated)[model] == 5 for model in selected_models)
    db_session.expunge_all()
    full_response = integrity.diagnose_inventory_integrity(db_session, sample_limit=None).model_dump(exclude={"generated_at"})
    assert optimized == full_response


def test_snapshot_rejects_malformed_effect_json_after_identity_map_clear(db_session: Session) -> None:
    """Column-level JSON decoding remains mandatory when ORM instances are avoided."""
    operation = _operation(db_session)
    effect = InventoryOperationEffect(
        operation_id=operation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="StockRequest", subject_id="malformed-json", role="REQUEST_STATUS",
        before_state={"status": "submitted"}, after_state={"status": "completed"},
    )
    db_session.add(effect)
    db_session.flush()
    db_session.connection().exec_driver_sql(
        "UPDATE inventory_operation_effects SET before_state = ? WHERE effect_id = ?",
        ("{broken-json", effect.effect_id.hex),
    )
    db_session.expunge_all()
    with pytest.raises(ValueError):
        integrity._collect_integrity_snapshot(db_session)


@pytest.mark.parametrize("state", ["loaded", "dirty", "expired", "pending"])
def test_snapshot_preserves_effect_identity_state(db_session: Session, state: str) -> None:
    """Scalar reads must not replace an already observed or pending effect."""
    operation = _operation(db_session)
    effect = InventoryOperationEffect(
        operation_id=operation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="StockRequest", subject_id="identity-state", role="REQUEST_STATUS",
        before_state={"status": "submitted"}, after_state={"status": "completed"},
    )
    db_session.add(effect)
    if state != "pending":
        db_session.flush()
        if state == "dirty":
            effect.before_state = {}
        elif state == "expired":
            db_session.expire(effect)
    snapshot = integrity._collect_integrity_snapshot(db_session)
    evidence = [row for row in snapshot.operation_evidence if row.kind == "operation_effect"]
    if state == "pending":
        assert evidence == []
        assert effect in db_session.new
    else:
        assert len(evidence) == 1
        assert evidence[0].valid is (state != "dirty")
        assert db_session.get(InventoryOperationEffect, effect.effect_id) is effect
        assert not {"before_state", "after_state"} & inspect(effect).unloaded


def test_snapshot_operation_alias_matches_first_orm_identity(db_session: Session) -> None:
    """Distinct raw UUID spellings must retain Query(Model).all() identity behavior."""
    operation = _operation(db_session)
    operation_id = operation.operation_id
    db_session.connection().exec_driver_sql(
        "INSERT INTO inventory_operations "
        "(operation_id, kind, domain, action, status, display_label, actor_name, "
        "effective_at, contract_version, created_at) "
        "SELECT ?, kind, domain, action, status, display_label, actor_name, "
        "effective_at, contract_version + 1, created_at "
        "FROM inventory_operations WHERE operation_id = ?",
        (str(operation_id).upper(), operation_id.hex),
    )
    db_session.expunge_all()
    original = db_session.query(InventoryOperation).all()
    assert len(original) == 1
    expected = [(str(row.operation_id), row.contract_version) for row in original]
    db_session.expunge_all()

    snapshot = integrity._collect_integrity_snapshot(db_session)
    assert [(row.operation_id, row.contract_version) for row in snapshot.operations] == expected


def test_snapshot_effect_alias_matches_first_orm_identity(db_session: Session) -> None:
    """Effect UUID aliases must not duplicate evidence or replace the first value."""
    operation = _operation(db_session)
    effect = InventoryOperationEffect(
        operation_id=operation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="StockRequest", subject_id="uuid-alias", role="REQUEST_STATUS",
        before_state={"status": "submitted"}, after_state={"status": "completed"},
    )
    db_session.add(effect)
    db_session.flush()
    effect_id = effect.effect_id
    db_session.connection().exec_driver_sql(
        "INSERT INTO inventory_operation_effects "
        "(effect_id, operation_id, effect_kind, subject_type, subject_id, role, "
        "before_state, after_state, created_at) "
        "SELECT ?, operation_id, effect_kind, subject_type, subject_id, role, "
        "?, after_state, created_at "
        "FROM inventory_operation_effects WHERE effect_id = ?",
        (str(effect_id).upper(), "{}", effect_id.hex),
    )
    db_session.expunge_all()
    original = db_session.query(InventoryOperationEffect).all()
    assert len(original) == 1
    expected = [(str(row.effect_id), bool(row.before_state)) for row in original]
    db_session.expunge_all()

    snapshot = integrity._collect_integrity_snapshot(db_session)
    evidence = [row for row in snapshot.operation_evidence if row.kind == "operation_effect"]
    assert [(row.evidence_id, row.valid) for row in evidence] == expected


def test_snapshot_alias_still_validates_duplicate_effect_json(db_session: Session) -> None:
    """A discarded UUID alias must still run every selected column processor."""
    operation = _operation(db_session)
    effect = InventoryOperationEffect(
        operation_id=operation.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="StockRequest", subject_id="uuid-alias-invalid", role="REQUEST_STATUS",
        before_state={"status": "submitted"}, after_state={"status": "completed"},
    )
    db_session.add(effect)
    db_session.flush()
    db_session.connection().exec_driver_sql(
        "INSERT INTO inventory_operation_effects "
        "(effect_id, operation_id, effect_kind, subject_type, subject_id, role, "
        "before_state, after_state, created_at) "
        "SELECT ?, operation_id, effect_kind, subject_type, subject_id, role, "
        "?, after_state, created_at "
        "FROM inventory_operation_effects WHERE effect_id = ?",
        (str(effect.effect_id).upper(), "{broken-json", effect.effect_id.hex),
    )
    db_session.expunge_all()
    with pytest.raises(ValueError):
        db_session.query(InventoryOperationEffect).all()
    db_session.expunge_all()
    with pytest.raises(ValueError):
        integrity._collect_integrity_snapshot(db_session)


@pytest.mark.parametrize("model,column,value,error", [
    (Inventory, "updated_at", "invalid-date", ValueError),
    (ShippingRequest, "finalization_mode", "invalid-mode", LookupError),
])
def test_new_scalar_scans_still_reject_malformed_typed_columns(
    db_session: Session, make_item: Callable[..., Any], model: type,
    column: str, value: str, error: type[Exception],
) -> None:
    """Selected dates and enums keep the original ORM result processors."""
    item = make_item(process_type_code="PF")
    if model is Inventory:
        primary_key = db_session.query(Inventory.inventory_id).one()[0]
        column_name = "inventory_id"
    else:
        shipping = ShippingRequest(base_pf_item_id=item.item_id, request_quantity=1)
        db_session.add(shipping)
        db_session.flush()
        primary_key = shipping.request_id
        column_name = "request_id"
    db_session.connection().exec_driver_sql(
        f"UPDATE {model.__tablename__} SET {column} = ? WHERE {column_name} = ?",
        (value, primary_key.hex),
    )
    db_session.expunge_all()
    with pytest.raises(error):
        integrity._collect_integrity_snapshot(db_session)


def test_new_scalar_stock_request_alias_keeps_first_orm_identity(db_session: Session) -> None:
    """UUID spelling aliases in an added scalar scan retain the first ORM row."""
    employee = Employee(employee_code="alias-request", name="Alias", role="admin", department="assembly")
    db_session.add(employee)
    db_session.flush()
    request = StockRequest(
        requester_employee_id=employee.employee_id, requester_name="Alias",
        requester_department="assembly", request_type=StockRequestTypeEnum.RAW_SHIP,
    )
    db_session.add(request)
    db_session.flush()
    request_id = request.request_id
    db_session.connection().exec_driver_sql(
        "INSERT INTO stock_requests (request_id, requester_employee_id, requester_name, "
        "requester_department, request_type, status, requires_warehouse_approval, "
        "requires_department_approval, requires_as_research_approval, created_at, updated_at) "
        "SELECT ?, requester_employee_id, requester_name, requester_department, request_type, "
        "'COMPLETED', requires_warehouse_approval, requires_department_approval, "
        "requires_as_research_approval, created_at, updated_at "
        "FROM stock_requests WHERE request_id = ?",
        (str(request_id).upper(), request_id.hex),
    )
    db_session.expunge_all()
    original = db_session.query(StockRequest).all()
    assert len(original) == 1
    expected = [(str(row.request_id), row.status.value) for row in original]
    db_session.expunge_all()
    snapshot = integrity._collect_integrity_snapshot(db_session)
    assert [(row.request_id, row.status) for row in snapshot.stock_requests] == expected
