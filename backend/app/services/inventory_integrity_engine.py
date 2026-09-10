"""Pure inventory integrity evaluation shared by every presentation layer."""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal, Mapping, Sequence


IntegritySeverity = Literal["blocking", "warning"]
IntegrityStatus = Literal["pass", "warning", "fail"]

CHECK_DEFINITIONS: tuple[tuple[str, IntegritySeverity], ...] = (
    ("INVENTORY_TOTAL_MISMATCH", "blocking"),
    ("NEGATIVE_INVENTORY", "blocking"),
    ("NEGATIVE_LOCATION", "blocking"),
    ("PENDING_RESERVATION_MISMATCH", "blocking"),
    ("STOCK_REQUEST_STATE_MISMATCH", "blocking"),
    ("SHIPPING_ALLOCATION_MISMATCH", "blocking"),
    ("WAREHOUSE_PHYSICAL_MISMATCH", "blocking"),
    ("ORPHAN_REFERENCE", "blocking"),
    ("OPERATION_V2_EFFECT_INVALID", "blocking"),
    ("OPERATION_V1_EFFECT_MISSING", "warning"),
    ("DEFECT_STOCK_MISMATCH", "blocking"),
    ("PARTIAL_CANCELLATION", "blocking"),
    ("WORKFLOW_STATE_RESIDUE", "blocking"),
    ("DUPLICATE_REVERSAL", "blocking"),
    ("WEEKLY_UNCLASSIFIED_EFFECT", "blocking"),
)
CHECK_SEVERITY = dict(CHECK_DEFINITIONS)
SAMPLE_LIMIT = 5


@dataclass(frozen=True)
class InventoryState:
    row_id: str
    item_id: str
    quantity: Decimal
    warehouse_quantity: Decimal
    pending_quantity: Decimal


@dataclass(frozen=True)
class LocationState:
    row_id: str
    item_id: str
    department: str
    status: str
    quantity: Decimal
    pending_quantity: Decimal


@dataclass(frozen=True)
class StockRequestState:
    request_id: str
    request_code: str | None
    status: str
    created_at: datetime


@dataclass(frozen=True)
class StockRequestLineState:
    line_id: str
    request_id: str
    item_id: str
    status: str
    from_bucket: str
    from_department: str | None
    quantity: Decimal


@dataclass(frozen=True)
class ShippingRequestState:
    request_id: str
    status: str


@dataclass(frozen=True)
class ShippingAllocationState:
    allocation_id: str
    request_id: str
    item_id: str
    department: str | None
    status: str
    quantity: Decimal


@dataclass(frozen=True)
class WarehousePlacementState:
    row_id: str
    item_id: str
    scope: Literal["box", "special_zone", "unplaced"]
    quantity: Decimal
    container_id: str | None = None
    container_exists: bool = True
    active: bool = True


@dataclass(frozen=True)
class WarehouseBoxState:
    box_id: str
    angle_id: str
    angle_exists: bool


@dataclass(frozen=True)
class OperationState:
    operation_id: str
    contract_version: int
    effective_at: datetime
    reverses_operation_id: str | None = None


@dataclass(frozen=True)
class TransactionEffectState:
    log_id: str
    item_id: str
    operation_id: str | None
    created_at: datetime
    transaction_type: str
    operation_role: str | None
    quantity_change: Decimal
    reference_no: str | None
    notes: str | None
    inventory_effect: object


@dataclass(frozen=True)
class OperationEvidenceState:
    evidence_id: str
    operation_id: str
    kind: Literal["operation_effect", "defect_movement"]
    valid: bool


@dataclass(frozen=True)
class InventoryIntegritySnapshot:
    """Database-independent input needed to evaluate every IC-17 invariant."""

    item_ids: frozenset[str] = field(default_factory=frozenset)
    active_item_ids: frozenset[str] = field(default_factory=frozenset)
    inventories: tuple[InventoryState, ...] = ()
    locations: tuple[LocationState, ...] = ()
    stock_requests: tuple[StockRequestState, ...] = ()
    stock_request_lines: tuple[StockRequestLineState, ...] = ()
    shipping_requests: tuple[ShippingRequestState, ...] = ()
    shipping_allocations: tuple[ShippingAllocationState, ...] = ()
    warehouse_boxes: tuple[WarehouseBoxState, ...] = ()
    warehouse_placements: tuple[WarehousePlacementState, ...] = ()
    operations: tuple[OperationState, ...] = ()
    transactions: tuple[TransactionEffectState, ...] = ()
    operation_evidence: tuple[OperationEvidenceState, ...] = ()
    cutover_at: datetime | None = None
    evaluated_at: datetime | None = None


@dataclass(frozen=True)
class IntegrityFinding:
    check_id: str
    sample: Mapping[str, object]


@dataclass(frozen=True)
class IntegrityCheckResult:
    check_id: str
    severity: IntegritySeverity
    count: int
    samples: list[dict[str, object]]


@dataclass(frozen=True)
class InventoryIntegrityResult:
    contract: Literal["inventory-integrity/v1"]
    status: IntegrityStatus
    blocking_count: int
    warning_count: int
    checks: list[IntegrityCheckResult]


def _quantity(value: Decimal) -> int | str:
    if value == value.to_integral_value():
        return int(value)
    return format(value.normalize(), "f")


def _finding(check_id: str, **sample: object) -> IntegrityFinding:
    return IntegrityFinding(check_id=check_id, sample=sample)


def _inventory_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    location_totals: dict[str, Decimal] = defaultdict(Decimal)
    for location in snapshot.locations:
        location_totals[location.item_id] += location.quantity

    findings: list[IntegrityFinding] = []
    for inventory in snapshot.inventories:
        computed = inventory.warehouse_quantity + location_totals[inventory.item_id]
        if inventory.quantity != computed:
            findings.append(
                _finding(
                    "INVENTORY_TOTAL_MISMATCH",
                    item_id=inventory.item_id,
                    stored_quantity=_quantity(inventory.quantity),
                    computed_quantity=_quantity(computed),
                )
            )
        if any(
            value < 0
            for value in (
                inventory.quantity,
                inventory.warehouse_quantity,
                inventory.pending_quantity,
            )
        ):
            findings.append(
                _finding(
                    "NEGATIVE_INVENTORY",
                    item_id=inventory.item_id,
                    quantity=_quantity(inventory.quantity),
                    warehouse_quantity=_quantity(inventory.warehouse_quantity),
                    pending_quantity=_quantity(inventory.pending_quantity),
                )
            )
    for location in snapshot.locations:
        if location.quantity < 0 or location.pending_quantity < 0:
            findings.append(
                _finding(
                    "NEGATIVE_LOCATION",
                    location_id=location.row_id,
                    item_id=location.item_id,
                    department=location.department,
                    status=location.status,
                    quantity=_quantity(location.quantity),
                    pending_quantity=_quantity(location.pending_quantity),
                )
            )
    return findings


def _reservation_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    requests = {row.request_id: row for row in snapshot.stock_requests}
    expected: dict[tuple[str, str, str, str], Decimal] = defaultdict(Decimal)
    for line in snapshot.stock_request_lines:
        request = requests.get(line.request_id)
        if request is None or request.status != "reserved" or line.status != "reserved":
            continue
        if line.from_bucket == "warehouse":
            key = ("warehouse", line.item_id, "", "")
        elif line.from_bucket in {"production", "defective"}:
            status = "PRODUCTION" if line.from_bucket == "production" else "DEFECTIVE"
            key = ("location", line.item_id, line.from_department or "", status)
        else:
            continue
        expected[key] += line.quantity

    actual: dict[tuple[str, str, str, str], tuple[Decimal, Decimal, str | None]] = {}
    for inventory in snapshot.inventories:
        actual[("warehouse", inventory.item_id, "", "")] = (
            inventory.pending_quantity,
            inventory.warehouse_quantity,
            inventory.row_id,
        )
    for location in snapshot.locations:
        actual[("location", location.item_id, location.department, location.status)] = (
            location.pending_quantity,
            location.quantity,
            location.row_id,
        )

    findings: list[IntegrityFinding] = []
    for key in sorted(set(actual) | set(expected)):
        scope, item_id, department, status = key
        stored, physical, row_id = actual.get(
            key,
            (Decimal("0"), Decimal("0"), None),
        )
        reserved = expected.get(key, Decimal("0"))
        if stored != reserved:
            sample: dict[str, object] = {
                "scope": scope,
                "item_id": item_id,
                "stored_pending": _quantity(stored),
                "reserved_quantity": _quantity(reserved),
            }
            if scope == "location":
                sample.update(department=department, status=status)
            if row_id is not None:
                sample["row_id"] = row_id
            findings.append(IntegrityFinding("PENDING_RESERVATION_MISMATCH", sample))
        if stored > physical:
            findings.append(
                _finding(
                    "PENDING_RESERVATION_MISMATCH",
                    scope=scope,
                    item_id=item_id,
                    row_id=row_id,
                    reason="pending_exceeds_physical",
                    pending_quantity=_quantity(stored),
                    physical_quantity=_quantity(physical),
                )
            )
    return findings


def _stock_request_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    lines_by_request: dict[str, list[StockRequestLineState]] = defaultdict(list)
    for line in snapshot.stock_request_lines:
        lines_by_request[line.request_id].append(line)

    findings: list[IntegrityFinding] = []
    for request in snapshot.stock_requests:
        if (
            request.status == "reserved"
            and snapshot.evaluated_at is not None
            and request.created_at < snapshot.evaluated_at - timedelta(days=7)
        ):
            findings.append(
                _finding(
                    "STOCK_REQUEST_STATE_MISMATCH",
                    request_id=request.request_id,
                    request_code=request.request_code,
                    created_at=request.created_at.isoformat(),
                    reason="stale_reserved",
                )
            )
        mismatched = sorted(
            line.line_id
            for line in lines_by_request[request.request_id]
            if line.status != request.status
        )
        if mismatched:
            findings.append(
                _finding(
                    "STOCK_REQUEST_STATE_MISMATCH",
                    request_id=request.request_id,
                    request_status=request.status,
                    mismatched_line_ids=mismatched,
                )
            )
    return findings


def _shipping_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    requests = {row.request_id: row.status for row in snapshot.shipping_requests}
    locations = {
        (row.item_id, row.department, row.status): row
        for row in snapshot.locations
    }
    reserved_by_cell: dict[tuple[str, str], Decimal] = defaultdict(Decimal)
    allocation_statuses: dict[str, set[str]] = defaultdict(set)
    findings: list[IntegrityFinding] = []

    for allocation in snapshot.shipping_allocations:
        request_status = requests.get(allocation.request_id)
        allocation_statuses[allocation.request_id].add(allocation.status)
        expected_request_status = {
            "RESERVED": "PREPARED",
            "CONSUMED": "PICKED_UP",
        }.get(allocation.status)
        if allocation.status not in {"RESERVED", "RELEASED", "CONSUMED"}:
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    allocation_id=allocation.allocation_id,
                    request_id=allocation.request_id,
                    allocation_status=allocation.status,
                    request_status=request_status,
                )
            )
        elif (
            request_status is not None
            and expected_request_status is not None
            and request_status != expected_request_status
        ):
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    allocation_id=allocation.allocation_id,
                    request_id=allocation.request_id,
                    allocation_status=allocation.status,
                    request_status=request_status,
                )
            )
        if allocation.quantity <= 0:
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    allocation_id=allocation.allocation_id,
                    request_id=allocation.request_id,
                    reason="non_positive_quantity",
                    quantity=_quantity(allocation.quantity),
                )
            )
        if (
            allocation.status == "RESERVED"
            and allocation.department
            and allocation.quantity > 0
        ):
            reserved_by_cell[(allocation.item_id, allocation.department)] += allocation.quantity
        elif allocation.status == "RESERVED" and not allocation.department:
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    allocation_id=allocation.allocation_id,
                    request_id=allocation.request_id,
                    reason="missing_department",
                )
            )

    for request in snapshot.shipping_requests:
        statuses = allocation_statuses[request.request_id]
        expected_active = {
            "PREPARED": "RESERVED",
            "PICKED_UP": "CONSUMED",
        }.get(request.status)
        if statuses and expected_active is not None and expected_active not in statuses:
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    request_id=request.request_id,
                    request_status=request.status,
                    reason="missing_active_allocation",
                    expected_allocation_status=expected_active,
                )
            )

    for (item_id, department), reserved in sorted(reserved_by_cell.items()):
        location = locations.get((item_id, department, "PRODUCTION"))
        if location is None:
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    item_id=item_id,
                    department=department,
                    reason="missing_location",
                    reserved_quantity=_quantity(reserved),
                )
            )
            continue
        available_for_shipping = max(
            Decimal("0"),
            location.quantity - location.pending_quantity,
        )
        if reserved > available_for_shipping:
            findings.append(
                _finding(
                    "SHIPPING_ALLOCATION_MISMATCH",
                    item_id=item_id,
                    department=department,
                    reason="reserved_exceeds_location_stock",
                    reserved_quantity=_quantity(reserved),
                    available_quantity=_quantity(available_for_shipping),
                )
            )
    return findings


def _warehouse_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    box: dict[str, Decimal] = defaultdict(Decimal)
    zone: dict[str, Decimal] = defaultdict(Decimal)
    unplaced: dict[str, Decimal] = defaultdict(Decimal)
    unplaced_rows: dict[str, int] = defaultdict(int)
    findings: list[IntegrityFinding] = []

    for placement in snapshot.warehouse_placements:
        if placement.quantity < 0:
            findings.append(
                _finding(
                    "WAREHOUSE_PHYSICAL_MISMATCH",
                    scope=placement.scope,
                    row_id=placement.row_id,
                    item_id=placement.item_id,
                    reason="negative_quantity",
                    quantity=_quantity(placement.quantity),
                )
            )
        if placement.scope == "box":
            box[placement.item_id] += placement.quantity
        elif placement.scope == "special_zone":
            if placement.active:
                zone[placement.item_id] += placement.quantity
            elif placement.quantity != 0:
                findings.append(
                    _finding(
                        "WAREHOUSE_PHYSICAL_MISMATCH",
                        scope=placement.scope,
                        row_id=placement.row_id,
                        item_id=placement.item_id,
                        reason="inactive_zone_stock",
                        quantity=_quantity(placement.quantity),
                    )
                )
        else:
            unplaced[placement.item_id] += placement.quantity
            unplaced_rows[placement.item_id] += 1

    inventories = {row.item_id: row for row in snapshot.inventories}
    target_ids = set(snapshot.active_item_ids) | set(inventories) | set(box) | set(zone) | set(unplaced)
    for item_id in sorted(target_ids):
        inventory = inventories.get(item_id)
        if inventory is None:
            if item_id in snapshot.active_item_ids:
                findings.append(
                    _finding(
                        "WAREHOUSE_PHYSICAL_MISMATCH",
                        item_id=item_id,
                        reason="missing_inventory",
                    )
                )
            continue
        if item_id in snapshot.active_item_ids and unplaced_rows[item_id] != 1:
            findings.append(
                _finding(
                    "WAREHOUSE_PHYSICAL_MISMATCH",
                    item_id=item_id,
                    reason="missing_unplaced" if unplaced_rows[item_id] == 0 else "duplicate_unplaced",
                    unplaced_rows=unplaced_rows[item_id],
                )
            )
        physical = box[item_id] + zone[item_id] + unplaced[item_id]
        if physical != inventory.warehouse_quantity:
            findings.append(
                _finding(
                    "WAREHOUSE_PHYSICAL_MISMATCH",
                    box_quantity=_quantity(box[item_id]),
                    item_id=item_id,
                    special_zone_quantity=_quantity(zone[item_id]),
                    unplaced_quantity=_quantity(unplaced[item_id]),
                    warehouse_quantity=_quantity(inventory.warehouse_quantity),
                )
            )
    return findings


def _orphan_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    inventories = {row.item_id for row in snapshot.inventories}
    requests = {row.request_id for row in snapshot.stock_requests}
    shipping_requests = {row.request_id for row in snapshot.shipping_requests}
    operations = {row.operation_id for row in snapshot.operations}
    findings: list[IntegrityFinding] = []

    for box in snapshot.warehouse_boxes:
        if not box.angle_exists:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="warehouse_box",
                    row_id=box.box_id,
                    reason="missing_angle",
                )
            )
    for inventory in snapshot.inventories:
        if inventory.item_id not in snapshot.item_ids:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="inventory",
                    row_id=inventory.row_id,
                    reason="missing_item",
                )
            )
    for location in snapshot.locations:
        reason = None
        if location.item_id not in snapshot.item_ids:
            reason = "missing_item"
        elif location.item_id not in inventories:
            reason = "missing_inventory"
        if reason:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="inventory_location",
                    row_id=location.row_id,
                    item_id=location.item_id,
                    reason=reason,
                )
            )
    for line in snapshot.stock_request_lines:
        if line.request_id not in requests or line.item_id not in snapshot.item_ids:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="stock_request_line",
                    row_id=line.line_id,
                    reason=("missing_request" if line.request_id not in requests else "missing_item"),
                )
            )
    for allocation in snapshot.shipping_allocations:
        if allocation.request_id not in shipping_requests or allocation.item_id not in snapshot.item_ids:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="shipping_allocation",
                    row_id=allocation.allocation_id,
                    reason=(
                        "missing_request"
                        if allocation.request_id not in shipping_requests
                        else "missing_item"
                    ),
                )
            )
    for placement in snapshot.warehouse_placements:
        reason = None
        if placement.item_id not in snapshot.item_ids:
            reason = "missing_item"
        elif not placement.container_exists:
            reason = "missing_container"
        elif placement.item_id not in inventories:
            reason = "missing_inventory"
        if reason:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type=f"warehouse_{placement.scope}",
                    row_id=placement.row_id,
                    reason=reason,
                )
            )
    for transaction in snapshot.transactions:
        if transaction.item_id not in snapshot.item_ids:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="transaction_log",
                    row_id=transaction.log_id,
                    reason="missing_item",
                )
            )
        if transaction.operation_id and transaction.operation_id not in operations:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="transaction_log",
                    row_id=transaction.log_id,
                    reason="missing_operation",
                )
            )
    for evidence in snapshot.operation_evidence:
        if evidence.operation_id not in operations:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type=evidence.kind,
                    row_id=evidence.evidence_id,
                    reason="missing_operation",
                )
            )
    for operation in snapshot.operations:
        if operation.reverses_operation_id and operation.reverses_operation_id not in operations:
            findings.append(
                _finding(
                    "ORPHAN_REFERENCE",
                    row_type="inventory_operation",
                    row_id=operation.operation_id,
                    reason="missing_reversed_operation",
                )
            )
    return findings


def _is_uuid(value: object) -> bool:
    try:
        uuid.UUID(str(value))
    except (ValueError, AttributeError):
        return False
    return True


def _effect_identity_is_valid(
    transaction: TransactionEffectState,
    cell: Mapping[str, object],
    *,
    inventory_items_by_row: Mapping[str, str],
    location_keys: frozenset[tuple[str, str, str]],
    placement_by_scope_row: Mapping[tuple[str, str], WarehousePlacementState],
) -> bool:
    scope = str(cell["scope"])
    if scope == "warehouse":
        return (
            inventory_items_by_row.get(str(cell["row_id"]))
            == transaction.item_id
        )
    if scope == "location":
        return (
            transaction.item_id,
            str(cell["department"]),
            str(cell["status"]),
        ) in location_keys

    row_id = str(cell["row_id"])
    placement = placement_by_scope_row.get((scope, row_id))
    if scope == "warehouse_unplaced":
        return placement is not None and placement.item_id == transaction.item_id
    if placement is not None:
        container_key = "box_id" if scope == "warehouse_box" else "zone_id"
        return (
            placement.item_id == transaction.item_id
            and placement.container_id == str(cell[container_key])
        )

    if not _is_uuid(row_id):
        return False
    if scope == "warehouse_box":
        return _is_uuid(cell["box_id"])
    try:
        return int(str(cell["zone_id"])) > 0
    except ValueError:
        return False


def _valid_inventory_effect(
    transaction: TransactionEffectState,
    *,
    inventory_items_by_row: Mapping[str, str],
    location_keys: frozenset[tuple[str, str, str]],
    placement_by_scope_row: Mapping[tuple[str, str], WarehousePlacementState],
) -> bool:
    effect = transaction.inventory_effect
    quantity_change = transaction.quantity_change
    if (
        not quantity_change.is_finite()
        or quantity_change != quantity_change.to_integral_value()
    ):
        return False
    if (
        effect == []
        and (transaction.reference_no or "").startswith("defect-disassemble:")
        and transaction.transaction_type == "DEFECT_SCRAP"
        and transaction.operation_role == "REWORK_CHILD_SCRAP"
        and transaction.notes == "[rework:scrap_child]"
    ):
        return quantity_change < 0
    if not isinstance(effect, list) or not effect:
        return False
    valid_scopes = {
        "warehouse",
        "location",
        "warehouse_box",
        "warehouse_zone",
        "warehouse_unplaced",
    }
    effect_identities: set[tuple[str, ...]] = set()
    warehouse_delta = Decimal("0")
    physical_delta = Decimal("0")
    logical_delta = Decimal("0")
    for cell in effect:
        if not isinstance(cell, dict) or cell.get("scope") not in valid_scopes:
            return False
        try:
            delta = Decimal(str(cell["delta"]))
            before = Decimal(str(cell["before_quantity"]))
            after = Decimal(str(cell["after_quantity"]))
        except (KeyError, InvalidOperation, TypeError, ValueError):
            return False
        quantities = (delta, before, after)
        if any(
            not quantity.is_finite()
            or quantity != quantity.to_integral_value()
            for quantity in quantities
        ):
            return False
        if delta == 0 or after - before != delta:
            return False
        scope = cell["scope"]
        if scope == "location" and not (
            cell.get("department")
            and cell.get("status") in {"PRODUCTION", "DEFECTIVE"}
        ):
            return False
        if scope in {
            "warehouse",
            "warehouse_box",
            "warehouse_zone",
            "warehouse_unplaced",
        } and not cell.get("row_id"):
            return False
        if scope == "warehouse_box" and not cell.get("box_id"):
            return False
        if scope == "warehouse_zone" and not cell.get("zone_id"):
            return False
        effect_identity = (
            (scope, str(cell.get("department")), str(cell.get("status")))
            if scope == "location"
            else (scope, str(cell.get("row_id")))
        )
        if effect_identity in effect_identities:
            return False
        effect_identities.add(effect_identity)
        if not _effect_identity_is_valid(
            transaction,
            cell,
            inventory_items_by_row=inventory_items_by_row,
            location_keys=location_keys,
            placement_by_scope_row=placement_by_scope_row,
        ):
            return False
        if scope == "warehouse":
            warehouse_delta += delta
            logical_delta += delta
        elif scope == "location":
            logical_delta += delta
        elif scope in {
            "warehouse_box",
            "warehouse_zone",
            "warehouse_unplaced",
        }:
            physical_delta += delta
    return (
        warehouse_delta == physical_delta
        and logical_delta == quantity_change
    )


def _is_post_cutover(
    snapshot: InventoryIntegritySnapshot,
    occurred_at: datetime,
) -> bool:
    return snapshot.cutover_at is not None and occurred_at >= snapshot.cutover_at


def _operation_check_id(
    snapshot: InventoryIntegritySnapshot,
    operation: OperationState,
    *,
    occurred_at: datetime | None = None,
) -> str:
    operation_is_post_cutover = _is_post_cutover(snapshot, operation.effective_at)
    event_is_post_cutover = occurred_at is not None and _is_post_cutover(
        snapshot,
        occurred_at,
    )
    if (
        operation.contract_version >= 2
        or operation_is_post_cutover
        or event_is_post_cutover
    ):
        return "OPERATION_V2_EFFECT_INVALID"
    return "OPERATION_V1_EFFECT_MISSING"


def _operation_findings(snapshot: InventoryIntegritySnapshot) -> list[IntegrityFinding]:
    operations = {row.operation_id: row for row in snapshot.operations}
    transactions_by_operation: dict[str, list[TransactionEffectState]] = defaultdict(list)
    evidence_by_operation: dict[str, list[OperationEvidenceState]] = defaultdict(list)
    for transaction in snapshot.transactions:
        if transaction.operation_id in operations:
            transactions_by_operation[transaction.operation_id].append(transaction)
    for evidence_row in snapshot.operation_evidence:
        if evidence_row.operation_id in operations:
            evidence_by_operation[evidence_row.operation_id].append(evidence_row)
    inventory_items_by_row = {
        row.row_id: row.item_id
        for row in snapshot.inventories
    }
    location_keys = frozenset(
        (row.item_id, row.department, row.status)
        for row in snapshot.locations
    )
    placement_scope = {
        "box": "warehouse_box",
        "special_zone": "warehouse_zone",
        "unplaced": "warehouse_unplaced",
    }
    placement_by_scope_row = {
        (placement_scope[row.scope], row.row_id): row
        for row in snapshot.warehouse_placements
    }

    def valid_inventory_effect(transaction: TransactionEffectState) -> bool:
        return _valid_inventory_effect(
            transaction,
            inventory_items_by_row=inventory_items_by_row,
            location_keys=location_keys,
            placement_by_scope_row=placement_by_scope_row,
        )

    findings: list[IntegrityFinding] = []
    for operation in snapshot.operations:
        transactions = transactions_by_operation[operation.operation_id]
        evidence_rows = evidence_by_operation[operation.operation_id]
        check_id = _operation_check_id(snapshot, operation)
        if not transactions and not evidence_rows:
            findings.append(
                _finding(
                    check_id,
                    operation_id=operation.operation_id,
                    reason="missing_effect",
                )
            )
            continue
        for transaction in transactions:
            if not valid_inventory_effect(transaction):
                findings.append(
                    _finding(
                        _operation_check_id(
                            snapshot,
                            operation,
                            occurred_at=transaction.created_at,
                        ),
                        operation_id=operation.operation_id,
                        log_id=transaction.log_id,
                        reason="invalid_inventory_effect",
                    )
                )
        for row in evidence_rows:
            if not row.valid:
                findings.append(
                    _finding(
                        _operation_check_id(snapshot, operation),
                        operation_id=operation.operation_id,
                        evidence_id=row.evidence_id,
                        reason=f"invalid_{row.kind}",
                    )
                )

    for transaction in snapshot.transactions:
        if transaction.operation_id is not None:
            continue
        is_post_cutover = (
            snapshot.cutover_at is not None
            and transaction.created_at >= snapshot.cutover_at
        )
        if is_post_cutover:
            findings.append(
                _finding(
                    "OPERATION_V2_EFFECT_INVALID",
                    log_id=transaction.log_id,
                    reason="missing_operation",
                )
            )
        elif not valid_inventory_effect(transaction):
            findings.append(
                _finding(
                    "OPERATION_V1_EFFECT_MISSING",
                    log_id=transaction.log_id,
                    reason="missing_or_invalid_inventory_effect",
                )
            )
    return findings


def evaluate_inventory_integrity(
    snapshot: InventoryIntegritySnapshot,
    *,
    supplemental_findings: Sequence[IntegrityFinding] = (),
) -> InventoryIntegrityResult:
    """Evaluate a normalized snapshot and return a stable versioned verdict."""
    findings = [
        *_inventory_findings(snapshot),
        *_reservation_findings(snapshot),
        *_stock_request_findings(snapshot),
        *_shipping_findings(snapshot),
        *_warehouse_findings(snapshot),
        *_orphan_findings(snapshot),
        *_operation_findings(snapshot),
        *supplemental_findings,
    ]
    grouped: dict[str, list[dict[str, object]]] = defaultdict(list)
    for finding in findings:
        if finding.check_id not in CHECK_SEVERITY:
            raise ValueError(f"Unknown inventory integrity check: {finding.check_id}")
        grouped[finding.check_id].append(dict(finding.sample))

    checks: list[IntegrityCheckResult] = []
    for check_id, severity in CHECK_DEFINITIONS:
        samples = sorted(
            grouped[check_id],
            key=lambda sample: json.dumps(
                sample,
                ensure_ascii=False,
                sort_keys=True,
                default=str,
            ),
        )
        checks.append(
            IntegrityCheckResult(
                check_id=check_id,
                severity=severity,
                count=len(samples),
                samples=samples[:SAMPLE_LIMIT],
            )
        )

    blocking_count = sum(
        check.count for check in checks if check.severity == "blocking"
    )
    warning_count = sum(
        check.count for check in checks if check.severity == "warning"
    )
    status: IntegrityStatus = (
        "fail" if blocking_count else "warning" if warning_count else "pass"
    )
    return InventoryIntegrityResult(
        contract="inventory-integrity/v1",
        status=status,
        blocking_count=blocking_count,
        warning_count=warning_count,
        checks=checks,
    )
