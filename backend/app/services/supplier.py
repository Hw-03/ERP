"""원자재 입고에 공급업체를 연결하는 도메인 검증."""

from __future__ import annotations

import uuid

from sqlalchemy.orm import Session

from app.models import Supplier


def validate_supplier_for_operation(
    db: Session,
    *,
    work_type: str,
    sub_type: str,
    supplier_id: uuid.UUID | None,
) -> Supplier | None:
    """공급처 원자재 입고만 활성 공급업체를 갖도록 검증해 반환한다."""
    is_supplier_receipt = (work_type, sub_type) == ("receive", "receive_supplier")
    if not is_supplier_receipt:
        if supplier_id is not None:
            raise ValueError("supplier_id는 공급처 원자재 입고에만 사용할 수 있습니다.")
        return None
    if supplier_id is None:
        raise ValueError("공급처 원자재 입고에는 공급업체 선택이 필요합니다.")
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise ValueError("선택한 공급업체를 찾을 수 없습니다.")
    if not bool(supplier.is_active):
        raise ValueError("숨김 처리된 공급업체는 입고에 사용할 수 없습니다.")
    return supplier
