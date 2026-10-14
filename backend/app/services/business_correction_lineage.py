"""One causal source of truth for cancellation, current workflow and repair."""
import uuid

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import BusinessCorrection, BusinessCorrectionEffectLink, BusinessCorrectionSource, StocktakeControl, TransactionLog
from app.services.inventory_conflicts import InventoryConflict


def correction_for_operation(db: Session, operation_id: uuid.UUID) -> BusinessCorrection | None:
    """Legacy source logs still identify corrections after later ledger adoption."""
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        return None
    log_ids = db.query(TransactionLog.log_id).filter_by(operation_id=operation_id)
    source = db.query(BusinessCorrectionSource).filter(or_(
        (BusinessCorrectionSource.source_kind.in_(["operation", "workflow_operation"])) & (BusinessCorrectionSource.source_id == operation_id),
        (BusinessCorrectionSource.source_kind == "transaction") & BusinessCorrectionSource.source_id.in_(log_ids))).first()
    return db.get(BusinessCorrection, source.correction_id) if source else None


def assert_not_corrected(db: Session, logs: list[TransactionLog], operation_id: uuid.UUID | None = None) -> None:
    """State-only correction never grants a second physical undo through another route."""
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        return
    corrected = correction_for_operation(db, operation_id) if operation_id else None
    source = db.query(BusinessCorrectionSource).filter(BusinessCorrectionSource.source_kind == "transaction",
        BusinessCorrectionSource.source_id.in_([log.log_id for log in logs])).first()
    if corrected or source:
        raise InventoryConflict("BUSINESS_CORRECTED", "업무 정정된 원거래의 수량을 취소할 수 없습니다. 실제 반환·이동은 현재 시점의 업무로 처리해 주세요.",
            extra={"correction_id": str(corrected.correction_id if corrected else source.correction_id)})


def effect_was_corrected(db: Session, source_id: uuid.UUID, later_id: uuid.UUID | None = None) -> bool:
    """Explicit effect links establish order even when two operations share a timestamp."""
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL":
        return False
    row = db.get(BusinessCorrectionEffectLink, source_id)
    return row is not None and (later_id is None or row.correction_effect_id == later_id)


def is_correction(operation: object) -> bool:
    """Corrections keep BUSINESS semantics and are distinct from physical cancellations."""
    return operation.domain == "inventory" and operation.action == "business_correction"
