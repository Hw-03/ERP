"""직원별 품목 표시 순서 커스터마이징 라우터.

GET  /api/items/my-order?employee_id=<str>  → list[MyItemOrderEntry]
PUT  /api/items/my-order                    → {"ok": true}
DELETE /api/items/my-order?employee_id=<str> → {"ok": true}
"""

import uuid
from typing import List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, EmployeeItemOrder, Item
from app.routers._errors import ErrorCode, http_error
from app.schemas.item import MyItemOrderEntry, MyItemOrderPut

router = APIRouter()


def _get_employee_or_404(db: Session, employee_id: uuid.UUID) -> Employee:
    emp = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if emp is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    return emp


@router.get("/my-order", response_model=List[MyItemOrderEntry])
def get_my_order(
    employee_id: uuid.UUID = Query(..., description="직원 ID"),
    db: Session = Depends(get_db),
):
    """직원의 품목 표시 순서 조회. 행 없으면 빈 배열."""
    _get_employee_or_404(db, employee_id)
    rows = (
        db.query(EmployeeItemOrder)
        .filter(EmployeeItemOrder.employee_id == employee_id)
        .order_by(EmployeeItemOrder.display_order)
        .all()
    )
    return [MyItemOrderEntry(item_id=row.item_id, display_order=row.display_order) for row in rows]


@router.put("/my-order")
def put_my_order(payload: MyItemOrderPut, db: Session = Depends(get_db)):
    """직원의 품목 표시 순서 전체 교체.

    기존 행 전부 삭제 후 bulk insert (upsert 효과).
    존재하지 않는 item_id는 조용히 skip.
    """
    employee_id = payload.employee_id
    _get_employee_or_404(db, employee_id)

    # 존재하는 item_id만 허용 (FK 위반 방지 + silent skip)
    requested_ids = [str(e.item_id).replace("-", "") for e in payload.items]
    valid_ids = set()
    if requested_ids:
        existing = (
            db.query(Item.item_id)
            .filter(Item.item_id.in_(requested_ids))
            .all()
        )
        # UUIDString TypeDecorator는 UUID 객체를 반환 — hex로 정규화
        valid_ids = {row.item_id.hex if hasattr(row.item_id, "hex") else str(row.item_id).replace("-", "") for row in existing}

    # 기존 행 전부 삭제
    db.query(EmployeeItemOrder).filter(
        EmployeeItemOrder.employee_id == employee_id
    ).delete(synchronize_session=False)

    # 유효한 항목만 삽입
    for entry in payload.items:
        entry_hex = entry.item_id.hex if hasattr(entry.item_id, "hex") else str(entry.item_id).replace("-", "")
        if entry_hex not in valid_ids:
            continue
        db.add(EmployeeItemOrder(
            employee_id=employee_id,
            item_id=entry.item_id,
            display_order=entry.display_order,
        ))

    db.commit()
    return {"ok": True}


@router.delete("/my-order")
def delete_my_order(
    employee_id: uuid.UUID = Query(..., description="직원 ID"),
    db: Session = Depends(get_db),
):
    """직원의 품목 표시 순서 전체 삭제."""
    _get_employee_or_404(db, employee_id)
    db.query(EmployeeItemOrder).filter(
        EmployeeItemOrder.employee_id == employee_id
    ).delete(synchronize_session=False)
    db.commit()
    return {"ok": True}
