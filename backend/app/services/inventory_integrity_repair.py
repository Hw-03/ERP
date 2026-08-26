"""진단 결과 중 기대 상태가 명확한 한 문제만 원자적으로 복구한다."""

from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import (
    AdminAuditLog,
    HandoverDoc,
    HandoverStatusEnum,
    InventoryOperation,
    InventoryOperationEffect,
    IoBatch,
    ShippingAllocation,
    ShippingRequest,
    ShippingRequestStatusEnum,
    StockRequest,
    StockRequestStatusEnum,
)
from app.services.inventory_integrity import diagnose_inventory_integrity


class InventoryIntegrityRepairError(RuntimeError):
    """문제 ID가 없거나 안전한 기대 상태를 확정할 수 없을 때 발생한다."""


@dataclass(frozen=True)
class InventoryIntegrityRepairReport:
    problem_id: str
    category: str
    applied: bool
    approved_by: str
    before_value: str
    after_value: str


def _workflow_subject(db: Session, effect: InventoryOperationEffect):
    model_by_type = {
        "HandoverDoc": HandoverDoc,
        "ShippingRequest": ShippingRequest,
        "StockRequest": StockRequest,
        "IoBatch": IoBatch,
    }
    model = model_by_type.get(effect.subject_type)
    return db.get(model, effect.subject_id) if model is not None else None


def _set_workflow_status(
    db: Session,
    effect: InventoryOperationEffect,
) -> None:
    subject = _workflow_subject(db, effect)
    if subject is None:
        raise InventoryIntegrityRepairError("연결 업무를 찾을 수 없어 복구할 수 없습니다.")
    expected = str((effect.after_state or {}).get("status") or "")
    enum_by_type = {
        "HandoverDoc": HandoverStatusEnum,
        "ShippingRequest": ShippingRequestStatusEnum,
        "StockRequest": StockRequestStatusEnum,
    }
    enum_type = enum_by_type.get(effect.subject_type)
    subject.status = enum_type(expected) if enum_type is not None else expected.lower()

    cancellation = db.get(InventoryOperation, effect.operation_id)
    if cancellation is None:
        raise InventoryIntegrityRepairError("취소 작업을 찾을 수 없어 복구할 수 없습니다.")
    if hasattr(subject, "cancelled_at"):
        subject.cancelled_at = cancellation.effective_at
    if hasattr(subject, "cancelled_by_employee_id"):
        subject.cancelled_by_employee_id = cancellation.actor_employee_id
    if hasattr(subject, "cancelled_by_name"):
        subject.cancelled_by_name = cancellation.actor_name


def _set_allocation_status(
    db: Session,
    effect: InventoryOperationEffect,
) -> None:
    allocation = db.get(ShippingAllocation, effect.subject_id)
    if allocation is None:
        raise InventoryIntegrityRepairError("출하 배정을 찾을 수 없어 복구할 수 없습니다.")
    expected = str((effect.after_state or {}).get("status") or "")
    cancellation = db.get(InventoryOperation, effect.operation_id)
    if cancellation is None:
        raise InventoryIntegrityRepairError("취소 작업을 찾을 수 없어 복구할 수 없습니다.")
    allocation.status = expected
    allocation.released_at = cancellation.effective_at
    allocation.released_reason = f"정합성 복구: {cancellation.reason or '취소 작업 효과 반영'}"


def repair_inventory_integrity_issue(
    db: Session,
    *,
    problem_id: str,
    approved_by: str,
    apply: bool = False,
) -> InventoryIntegrityRepairReport:
    """명시된 한 문제만 복구하며 커밋 경계는 호출자가 소유한다."""
    if not problem_id.strip():
        raise InventoryIntegrityRepairError("문제 ID가 필요합니다.")
    if not approved_by.strip():
        raise InventoryIntegrityRepairError("승인자가 필요합니다.")

    diagnostic = diagnose_inventory_integrity(db)
    issue = next((row for row in diagnostic.issues if row.problem_id == problem_id), None)
    if issue is None:
        raise InventoryIntegrityRepairError("현재 진단 결과에서 문제 ID를 찾을 수 없습니다.")
    if not issue.repairable:
        raise InventoryIntegrityRepairError("이 문제는 시스템이 자동 추정해 복구할 수 없습니다.")

    report = InventoryIntegrityRepairReport(
        problem_id=issue.problem_id,
        category=issue.category,
        applied=apply,
        approved_by=approved_by.strip(),
        before_value=issue.current_value,
        after_value=issue.expected_value,
    )
    if not apply:
        return report

    if len(issue.cause_ids) < 2:
        raise InventoryIntegrityRepairError("복구 근거 효과 ID가 누락되었습니다.")
    effect = db.get(InventoryOperationEffect, issue.cause_ids[1])
    if effect is None:
        raise InventoryIntegrityRepairError("복구 근거 효과를 찾을 수 없습니다.")

    if issue.category == "WORKFLOW_STATE_RESIDUE":
        _set_workflow_status(db, effect)
    elif issue.category == "SHIPPING_ALLOCATION_MISMATCH":
        _set_allocation_status(db, effect)
    else:
        raise InventoryIntegrityRepairError("지원하지 않는 정합성 복구 유형입니다.")

    db.flush()
    remaining_ids = {
        row.problem_id for row in diagnose_inventory_integrity(db).issues
    }
    if issue.problem_id in remaining_ids:
        raise InventoryIntegrityRepairError("복구 후 정합성 재검사에 실패했습니다.")

    db.add(
        AdminAuditLog(
            actor_pin_role="approved-operator",
            action="inventory_integrity_repair",
            target_type=issue.category,
            target_id=issue.problem_id,
            payload_summary=json.dumps(
                {
                    "approved_by": approved_by.strip(),
                    "before": issue.current_value,
                    "after": issue.expected_value,
                    "cause_ids": issue.cause_ids,
                },
                ensure_ascii=False,
                sort_keys=True,
            ),
        )
    )
    db.flush()
    return report
