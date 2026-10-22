"""Draft 원장과 승인 예약이 공유하는 pending 보호 계약."""

from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from typing import Any, Callable
import uuid

import pytest
from sqlalchemy.orm import Session

from app.services import inventory_integrity_engine as engine


def _snapshot(*, bucket: str = "warehouse", batch_status: str = "draft",
              reservation_status: str = "reserved", item_exists: bool = True,
              batch_exists: bool = True) -> engine.InventoryIntegritySnapshot:
    """순수 검사기에 실제 pending과 두 종류의 예약을 제공한다."""
    warehouse = bucket == "warehouse"
    base = engine.InventoryIntegritySnapshot(
        item_ids=frozenset({"item"}) if item_exists else frozenset(),
        inventories=(engine.InventoryState("inventory", "item", Decimal(10),
                                            Decimal(10 if warehouse else 0),
                                            Decimal(5 if warehouse else 0)),),
        locations=() if warehouse else (
            engine.LocationState("location", "item", "ASSEMBLY", "PRODUCTION",
                                 Decimal(10), Decimal(5)),
        ),
        stock_requests=(engine.StockRequestState("request", "R", "reserved", datetime(2026, 1, 1)),),
        stock_request_lines=(engine.StockRequestLineState(
            "line", "request", "item", "reserved", bucket,
            None if warehouse else "ASSEMBLY", Decimal(2)),),
    )
    values = vars(base).copy()
    values.update(
        io_batches=(engine.IoBatchState(batch_id="batch", status=batch_status,
                                    reservation_status=reservation_status),) if batch_exists else (),
        draft_reservations=(engine.DraftReservationState(
            reservation_id="draft-reservation", batch_id="batch", item_id="item",
            source_bucket=bucket, source_department="" if warehouse else "ASSEMBLY",
            quantity=Decimal(3)),),
    )
    return engine.InventoryIntegritySnapshot(**values)


def _check(snapshot: engine.InventoryIntegritySnapshot, check_id: str) -> engine.IntegrityCheckResult:
    """검사 결과에서 비교하려는 불변식 하나만 선택한다."""
    return next(check for check in engine.evaluate_inventory_integrity(snapshot).checks
                if check.check_id == check_id)


@pytest.mark.parametrize("bucket", ["warehouse", "production"])
def test_pending_matches_combined_approval_and_draft_reservations(bucket: str) -> None:
    assert _check(_snapshot(bucket=bucket), "PENDING_RESERVATION_MISMATCH").count == 0


@pytest.mark.parametrize("status,reservation_status", [
    ("completed", "inactive"), ("submitted", "inactive"),
    ("draft", "inactive"), ("draft", "not_required"),
])
def test_draft_ledger_on_non_reserved_batch_is_workflow_residue(status: str, reservation_status: str) -> None:
    check = _check(_snapshot(batch_status=status, reservation_status=reservation_status),
                   "WORKFLOW_STATE_RESIDUE")
    assert check.count == 1
    assert check.samples[0]["reservation_id"] == "draft-reservation"


@pytest.mark.parametrize("missing,reason", [("item", "missing_item"), ("batch", "missing_batch")])
def test_draft_ledger_orphan_is_reported(missing: str, reason: str) -> None:
    check = _check(_snapshot(item_exists=missing != "item", batch_exists=missing != "batch"),
                   "ORPHAN_REFERENCE")
    assert any(sample.get("row_type") == "io_draft_reservation" and sample.get("reason") == reason
               for sample in check.samples)


@pytest.fixture
def reserved_cell(db_session: Session, make_item: Callable[..., Any],
                  make_location: Callable[..., Any]) -> Callable[[str], tuple[Any, Any, SimpleNamespace]]:
    """승인 원장 일부가 누락된 셀에도 다른 작업의 예약은 남아야 한다."""
    from app import models

    def make(bucket: str) -> tuple[Any, Any, SimpleNamespace]:
        """비활성 직원의 기존 draft와 별도 승인 예약을 같은 셀에 둔다."""
        employee = models.Employee(employee_code=uuid.uuid4().hex[:20], name="예약자",
                                   role="staff", department=models.DepartmentEnum.ASSEMBLY,
                                   is_active=False)
        db_session.add(employee)
        db_session.flush()
        batch = models.IoBatch(work_type="process", sub_type="manual", status="draft",
                               reservation_status="reserved", requester_employee_id=employee.employee_id,
                               requester_name=employee.name, requester_department=employee.department)
        db_session.add(batch)
        item = make_item(warehouse_qty=Decimal(10), pending=Decimal(6 if bucket == "warehouse" else 0))
        cell = db_session.query(models.Inventory).filter_by(item_id=item.item_id).one()
        department = None
        if bucket == "production":
            department = models.DepartmentEnum.ASSEMBLY.value
            cell = make_location(item.item_id, quantity=Decimal(10))
            cell.pending_quantity = Decimal(6)
            db_session.query(models.Inventory).filter_by(item_id=item.item_id).one().quantity = Decimal(20)
        db_session.flush()
        ledger = models.IoDraftReservation(batch_id=batch.batch_id, item_id=item.item_id,
                                          source_bucket=bucket, source_department=department or "",
                                          quantity=3)
        other = models.StockRequest(requester_employee_id=employee.employee_id,
                                    requester_name=employee.name, requester_department=employee.department,
                                    request_type=models.StockRequestTypeEnum.MANUAL_ADJUSTMENT,
                                    status=models.StockRequestStatusEnum.RESERVED)
        db_session.add_all([ledger, other])
        db_session.flush()
        db_session.add(models.StockRequestLine(request_id=other.request_id, item_id=item.item_id,
                                               item_name_snapshot=item.item_name,
                                               quantity=1, from_bucket=models.RequestBucketEnum(bucket),
                                               from_department=department, to_bucket=models.RequestBucketEnum.NONE,
                                               status=models.StockRequestStatusEnum.RESERVED))
        db_session.flush()
        line = SimpleNamespace(item_id=item.item_id, quantity=Decimal(4),
                               from_bucket=models.RequestBucketEnum(bucket), from_department=department)
        return cell, ledger, line

    return make


@pytest.mark.parametrize("bucket", ["warehouse", "production"])
@pytest.mark.parametrize("release", ["release_lines", "release_lines_best_effort"])
@pytest.mark.parametrize("pending,expected", [(2, 2), (4, 4), (6, 4)])
def test_approval_release_protects_draft_and_other_approval(
    reserved_cell: Callable[..., Any], db_session: Session, bucket: str, release: str,
    pending: int, expected: int,
) -> None:
    from app.models import TransactionLog
    from app.services import sr_reservation

    cell, ledger, line = reserved_cell(bucket)
    cell.pending_quantity = pending
    db_session.flush()
    physical = cell.quantity
    logs_before = db_session.query(TransactionLog).count()
    getattr(sr_reservation, release)(db_session, [line], request_id=uuid.uuid4())
    db_session.refresh(cell)
    assert cell.pending_quantity == expected
    assert cell.quantity == physical
    assert db_session.get(type(ledger), ledger.reservation_id).quantity == 3
    assert db_session.query(TransactionLog).count() == logs_before


@pytest.mark.parametrize("bucket", ["warehouse", "production"])
def test_collector_includes_draft_ledger_without_writes(
    reserved_cell: Callable[..., Any], db_session: Session, bucket: str,
) -> None:
    from app.services.inventory_integrity import _collect_integrity_snapshot

    cell, ledger, _line = reserved_cell(bucket)
    cell.pending_quantity = 4
    db_session.flush()
    snapshot = _collect_integrity_snapshot(db_session)
    assert len(snapshot.draft_reservations) == 1
    assert snapshot.draft_reservations[0].reservation_id == str(ledger.reservation_id)
    assert _check(snapshot, "PENDING_RESERVATION_MISMATCH").count == 0
    assert not db_session.dirty and not db_session.new and not db_session.deleted
