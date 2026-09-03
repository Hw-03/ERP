"""문제 ID 단위 정합성 복구와 전향 활성화 계약."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal

import pytest

from app.models import (
    AdminAuditLog,
    DefectInventoryMovement,
    DefectQuarantineRecord,
    DepartmentEnum,
    InventoryLocation,
    InventoryOperation,
    InventoryOperationEffect,
    InventoryOperationEffectKindEnum,
    InventoryOperationKindEnum,
    InventoryOperationStatusEnum,
    LocationStatusEnum,
    ShippingRequest,
    ShippingRequestStatusEnum,
    SystemSetting,
)
from app.services.inventory_integrity import diagnose_inventory_integrity
from app.services.inventory_integrity_repair import (
    InventoryIntegrityRepairError,
    repair_inventory_integrity_issue,
)
from app.services.inventory_operation_activation import (
    InventoryOperationActivationError,
    activate_inventory_operation_contract,
)
from app.services.inventory_operations import CUTOVER_SETTING_KEY
from app.services.weekly_report_contract import WEEKLY_V2_SETTING_KEY


def _operation(*, kind: InventoryOperationKindEnum, reverses=None) -> InventoryOperation:
    return InventoryOperation(
        operation_id=uuid.uuid4(),
        kind=kind,
        domain="shipping",
        action="pickup",
        status=InventoryOperationStatusEnum.COMMITTED,
        display_label="출하 픽업" if kind == InventoryOperationKindEnum.BUSINESS else "출하 픽업 취소",
        actor_name="원 취소자",
        department="출하",
        effective_at=datetime(2026, 8, 25, 9, 0),
        contract_version=1,
        reverses_operation_id=reverses,
    )


def _workflow_residue(db_session, make_item):
    item = make_item(name="복구 대상", process_type_code="PF")
    request = ShippingRequest(
        base_pf_item_id=item.item_id,
        request_quantity=Decimal("1"),
        status=ShippingRequestStatusEnum.PICKED_UP,
    )
    original = _operation(kind=InventoryOperationKindEnum.BUSINESS)
    cancellation = _operation(
        kind=InventoryOperationKindEnum.CANCELLATION,
        reverses=original.operation_id,
    )
    db_session.add_all([request, original, cancellation])
    db_session.flush()
    original_effect = InventoryOperationEffect(
        operation_id=original.operation_id,
        effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
        subject_type="ShippingRequest",
        subject_id=str(request.request_id),
        role="shipping_request",
        before_state={"status": "PREPARED"},
        after_state={"status": "PICKED_UP"},
    )
    db_session.add(original_effect)
    db_session.flush()
    db_session.add(
        InventoryOperationEffect(
            operation_id=cancellation.operation_id,
            effect_kind=InventoryOperationEffectKindEnum.WORKFLOW,
            subject_type="ShippingRequest",
            subject_id=str(request.request_id),
            role="shipping_request",
            before_state={"status": "PICKED_UP"},
            after_state={"status": "CANCELLED"},
            reverses_effect_id=original_effect.effect_id,
        )
    )
    db_session.commit()
    issue = next(
        issue
        for issue in diagnose_inventory_integrity(db_session).issues
        if issue.category == "WORKFLOW_STATE_RESIDUE"
    )
    return request, issue


def test_repair_issue_dry_run_does_not_mutate_or_audit(db_session, make_item):
    request, issue = _workflow_residue(db_session, make_item)

    report = repair_inventory_integrity_issue(
        db_session,
        problem_id=issue.problem_id,
        approved_by="관리자 김",
        apply=False,
    )

    db_session.refresh(request)
    assert report.applied is False
    assert request.status == ShippingRequestStatusEnum.PICKED_UP
    assert db_session.query(AdminAuditLog).count() == 0


def test_repair_issue_applies_one_problem_and_writes_audit(db_session, make_item):
    request, issue = _workflow_residue(db_session, make_item)

    report = repair_inventory_integrity_issue(
        db_session,
        problem_id=issue.problem_id,
        approved_by="관리자 김",
        apply=True,
    )
    db_session.commit()

    db_session.refresh(request)
    assert report.applied is True
    assert request.status == ShippingRequestStatusEnum.CANCELLED
    assert request.cancelled_by_name == "원 취소자"
    assert request.cancelled_at == datetime(2026, 8, 25, 9, 0)
    audit = db_session.query(AdminAuditLog).one()
    assert audit.action == "inventory_integrity_repair"
    assert audit.target_id == issue.problem_id
    assert "관리자 김" in (audit.payload_summary or "")
    assert issue.problem_id not in {
        row.problem_id for row in diagnose_inventory_integrity(db_session).issues
    }


def test_repair_issue_rejects_ambiguous_defect_mismatch(db_session, make_item):
    item = make_item(name="판단 불가 불량", process_type_code="VF")
    db_session.add_all(
        [
            InventoryLocation(
                item_id=item.item_id,
                department=DepartmentEnum.VACUUM,
                status=LocationStatusEnum.DEFECTIVE,
                quantity=Decimal("3"),
            ),
            DefectQuarantineRecord(
                item_id=item.item_id,
                department=DepartmentEnum.VACUUM.value,
                original_quantity=Decimal("2"),
                remaining_quantity=Decimal("2"),
                quarantined_by_name="테스트",
            ),
        ]
    )
    db_session.commit()
    issue = diagnose_inventory_integrity(db_session).issues[0]

    with pytest.raises(InventoryIntegrityRepairError, match="복구할 수 없습니다"):
        repair_inventory_integrity_issue(
            db_session,
            problem_id=issue.problem_id,
            approved_by="관리자 김",
            apply=True,
        )


def test_activation_dry_run_then_sets_ledger_now_and_weekly_next_monday(db_session):
    now = datetime(2026, 8, 25, 6, 30, tzinfo=UTC)

    preview = activate_inventory_operation_contract(
        db_session,
        approved_by="배포 관리자",
        now=now,
        apply=False,
    )

    assert preview.applied is False
    assert preview.ledger_starts_at == now
    assert preview.weekly_starts_at.isoformat() == "2026-08-31T00:00:00+09:00"
    assert db_session.get(SystemSetting, CUTOVER_SETTING_KEY) is None
    assert db_session.get(SystemSetting, WEEKLY_V2_SETTING_KEY) is None

    applied = activate_inventory_operation_contract(
        db_session,
        approved_by="배포 관리자",
        now=now,
        apply=True,
    )
    db_session.commit()

    assert applied.applied is True
    assert db_session.get(SystemSetting, CUTOVER_SETTING_KEY).setting_value == now.isoformat()
    assert (
        db_session.get(SystemSetting, WEEKLY_V2_SETTING_KEY).setting_value
        == "2026-08-31T00:00:00+09:00"
    )


def test_activation_seeds_existing_defect_opening_balance_once(
    db_session,
    make_item,
):
    now = datetime(2026, 8, 25, 6, 30, tzinfo=UTC)
    item = make_item(name="전환 기준선", process_type_code="VF")
    db_session.add_all(
        [
            InventoryLocation(
                item_id=item.item_id,
                department=DepartmentEnum.VACUUM,
                status=LocationStatusEnum.DEFECTIVE,
                quantity=Decimal("2"),
            ),
            DefectQuarantineRecord(
                item_id=item.item_id,
                department=DepartmentEnum.VACUUM.value,
                original_quantity=Decimal("5"),
                remaining_quantity=Decimal("2"),
                quarantined_at=datetime(2026, 8, 24, 5, 44),
                quarantined_by_name="기존 작업자",
            ),
        ]
    )
    db_session.commit()

    preview = activate_inventory_operation_contract(
        db_session,
        approved_by="배포 관리자",
        now=now,
        apply=False,
    )
    assert preview.applied is False
    assert db_session.query(DefectInventoryMovement).count() == 0

    activate_inventory_operation_contract(
        db_session,
        approved_by="배포 관리자",
        now=now,
        apply=True,
    )
    db_session.commit()
    activate_inventory_operation_contract(
        db_session,
        approved_by="배포 관리자",
        now=now,
        apply=True,
    )
    db_session.commit()

    movement = db_session.query(DefectInventoryMovement).one()
    operation = db_session.get(InventoryOperation, movement.operation_id)
    assert movement.quantity_delta == Decimal("2")
    assert movement.movement_type == "CUTOVER_BASELINE"
    assert movement.role == "OPENING_BALANCE"
    assert operation is not None
    assert operation.domain == "inventory_integrity"
    assert operation.action == "defect_cutover_baseline"
    assert diagnose_inventory_integrity(db_session).is_consistent is True


def test_activation_fails_closed_when_diagnostic_has_issue(db_session, make_item):
    item = make_item(name="활성화 차단", process_type_code="VF")
    db_session.add(
        InventoryLocation(
            item_id=item.item_id,
            department=DepartmentEnum.VACUUM,
            status=LocationStatusEnum.DEFECTIVE,
            quantity=Decimal("1"),
        )
    )
    db_session.commit()

    with pytest.raises(InventoryOperationActivationError, match="정합성 진단"):
        activate_inventory_operation_contract(
            db_session,
            approved_by="배포 관리자",
            now=datetime(2026, 8, 25, 6, 30, tzinfo=UTC),
            apply=True,
        )

    assert db_session.get(SystemSetting, CUTOVER_SETTING_KEY) is None
    assert db_session.get(SystemSetting, WEEKLY_V2_SETTING_KEY) is None


def test_activation_rolls_back_seeded_baseline_when_diagnostic_fails(
    db_session,
    make_item,
):
    item = make_item(name="기준선 롤백", process_type_code="VF")
    db_session.add_all(
        [
            InventoryLocation(
                item_id=item.item_id,
                department=DepartmentEnum.VACUUM,
                status=LocationStatusEnum.DEFECTIVE,
                quantity=Decimal("2"),
            ),
            DefectQuarantineRecord(
                item_id=item.item_id,
                department=DepartmentEnum.VACUUM.value,
                original_quantity=Decimal("1"),
                remaining_quantity=Decimal("1"),
                quarantined_at=datetime(2026, 8, 24, 5, 44),
                quarantined_by_name="기존 작업자",
            ),
        ]
    )
    db_session.commit()

    with pytest.raises(InventoryOperationActivationError, match="정합성 진단"):
        activate_inventory_operation_contract(
            db_session,
            approved_by="배포 관리자",
            now=datetime(2026, 8, 25, 6, 30, tzinfo=UTC),
            apply=True,
        )

    assert db_session.query(DefectInventoryMovement).count() == 0
    assert db_session.query(InventoryOperation).count() == 0
    assert db_session.get(SystemSetting, CUTOVER_SETTING_KEY) is None
