"""원자재 입출고에 공급업체를 연결하는 도메인 검증."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import DefectQuarantineRecord, Item, StockRequestTypeEnum, Supplier


def _defect_supplier_scope(db: Session, lines: Iterable[object]) -> str:
    """클라이언트 부서 대신 실제 격리 원건과 현재 품목으로 업체 범위를 결정한다."""
    scopes: set[str] = set()
    for line in lines:
        record_id = getattr(line, "record_id", None) or getattr(line, "defect_quarantine_record_id", None)
        record = db.get(DefectQuarantineRecord, record_id) if record_id is not None else None
        if record_id is not None and (record is None or record.item_id != getattr(line, "item_id")):
            raise ValueError("격리 기록과 반품 품목이 일치하지 않습니다.")
        if record is not None and getattr(record.department, "value", record.department) != getattr(getattr(line, "from_department", None), "value", getattr(line, "from_department", None)):
            raise ValueError("격리 기록과 반품 부서가 일치하지 않습니다.")
        item = db.get(Item, record.item_id) if record is not None else None
        scopes.add("tube" if record is not None and getattr(record.department, "value", record.department) == "튜브" and item is not None and item.process_type_code == "TR" else "warehouse")
    if len(scopes) > 1:
        raise ValueError("서로 다른 공급업체 작업범위의 불량 반품을 함께 처리할 수 없습니다.")
    return next(iter(scopes), "warehouse")


def validate_supplier_for_stock_request(
    db: Session,
    *,
    request_type: StockRequestTypeEnum,
    supplier_id: uuid.UUID | None,
    allow_missing_draft: bool = False,
    lines: Iterable[object] = (),
) -> Supplier | None:
    """불량 반품만 활성 공급업체를 갖도록 검증한다."""
    if request_type != StockRequestTypeEnum.DEFECT_RETURN:
        if supplier_id is not None:
            raise ValueError("supplier_id는 불량 반품에만 사용할 수 있습니다.")
        return None
    expected_scope = _defect_supplier_scope(db, lines)
    if supplier_id is None:
        if allow_missing_draft:
            return None
        raise ValueError("불량 반품에는 공급업체 선택이 필요합니다.")
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise ValueError("선택한 공급업체를 찾을 수 없습니다.")
    if not bool(supplier.is_active):
        raise ValueError("숨김 처리된 공급업체는 반품에 사용할 수 없습니다.")
    if supplier.scope != expected_scope:
        raise ValueError("공급업체 작업범위가 불량 반품 품목과 일치하지 않습니다.")
    return supplier


def validate_supplier_for_operation(
    db: Session,
    *,
    work_type: str,
    sub_type: str,
    supplier_id: uuid.UUID | None,
) -> Supplier | None:
    """원자재 입출고에 활성 공급업체를 연결한다."""
    is_tube = work_type == "tube_material" and sub_type in {"tube_receive_supplier", "tube_outbound_supplier"}
    is_supplier_receipt = is_tube or (work_type == "receive" and sub_type in {"receive_supplier", "outbound_supplier"})
    if not is_supplier_receipt:
        if supplier_id is not None:
            raise ValueError("supplier_id는 공급처 원자재 입출고에만 사용할 수 있습니다.")
        return None
    if supplier_id is None:
        raise ValueError("원자재 입출고에는 공급업체 선택이 필요합니다.")
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise ValueError("선택한 공급업체를 찾을 수 없습니다.")
    if not bool(supplier.is_active):
        raise ValueError("숨김 처리된 공급업체는 입출고에 사용할 수 없습니다.")
    if supplier.scope != ("tube" if is_tube else "warehouse"):
        raise ValueError("공급업체 작업범위가 원자재 입출고와 일치하지 않습니다.")
    return supplier
