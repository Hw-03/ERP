"""Department master router."""

from typing import Annotated, List, Optional

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers._errors import ErrorCode, http_error
from app.dependencies.admin import require_admin_pin
from app.models import (
    BOM, DefectQuarantineRecord, Department, Employee, Inventory, InventoryLocation,
    Item, LocationStatusEnum, StockRequest, StockRequestLine, StockRequestStatusEnum,
    TransactionLog,
)
from app.services.inv_base import PROCESS_TYPE_TO_DEPT
from app.services.reorder import reorder_by_display_order
from app.schemas import (
    DepartmentCreate,
    DepartmentDeleteRequest,
    DepartmentReorderPayload,
    DepartmentResponse,
    DepartmentUpdate,
)

router = APIRouter()


def _department_dependencies(db: Session, name: str) -> list[dict]:
    """Keep string-linked department facts intact and return all deletion blockers."""
    locations = db.query(InventoryLocation).filter(InventoryLocation.department == name)
    pending_ids = (
        db.query(StockRequest.request_id)
        .outerjoin(StockRequestLine, StockRequestLine.request_id == StockRequest.request_id)
        .filter(StockRequest.status.in_([
            StockRequestStatusEnum.DRAFT, StockRequestStatusEnum.SUBMITTED,
            StockRequestStatusEnum.RESERVED, StockRequestStatusEnum.FAILED_APPROVAL,
        ]), or_(
            StockRequest.requester_department == name, StockRequest.approval_department == name,
            StockRequestLine.from_department == name, StockRequestLine.to_department == name,
        )).distinct().count()
    )
    process_codes = [code for code, department in PROCESS_TYPE_TO_DEPT.items() if department.value == name]
    bom_count = db.query(BOM.bom_id).join(
        Item, or_(BOM.parent_item_id == Item.item_id, BOM.child_item_id == Item.item_id),
    ).filter(Item.process_type_code.in_(process_codes)).distinct().count() if process_codes else 0
    transaction_count = sum(
        department == name or any(effect.get("department") == name for effect in (effects or []))
        for department, effects in db.query(TransactionLog.department, TransactionLog.inventory_effect)
    )
    counts = [
        ("employee", "직원", db.query(Employee).filter(Employee.department == name).count()),
        ("normal_inventory", "정상 재고", locations.filter(InventoryLocation.status == LocationStatusEnum.PRODUCTION).count()),
        ("defective_inventory", "불량 재고", locations.filter(InventoryLocation.status == LocationStatusEnum.DEFECTIVE).count()),
        ("reservation", "예약 재고", locations.filter(InventoryLocation.pending_quantity > 0).count()),
        ("pending_request", "대기 결재", pending_ids),
        ("bom", "BOM", bom_count),
        ("transaction", "과거 거래", transaction_count),
        ("quarantine_record", "격리 원건", db.query(DefectQuarantineRecord).filter(DefectQuarantineRecord.department == name).count()),
    ]
    if name == "창고":
        counts.extend([
            ("warehouse_inventory", "창고 재고", db.query(Inventory).filter(Inventory.warehouse_qty > 0).count()),
            ("warehouse_reservation", "창고 예약", db.query(Inventory).filter(Inventory.pending_quantity > 0).count()),
        ])
    return [{"kind": kind, "label": label, "count": count} for kind, label, count in counts if count]


@router.get("", response_model=List[DepartmentResponse])
def list_departments(
    is_active: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Department)
    if is_active is not None:
        query = query.filter(Department.is_active == is_active)
    return query.order_by(Department.display_order.asc(), Department.name.asc()).all()


@router.post("", response_model=DepartmentResponse, status_code=status.HTTP_201_CREATED)
def create_department(
    payload: DepartmentCreate,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    if db.query(Department).filter(or_(Department.name == payload.name,
            func.coalesce(Department.display_name, Department.name) == payload.name)).first():
        raise http_error(409, ErrorCode.CONFLICT, "이미 존재하는 부서명입니다.")
    dept = Department(
        name=payload.name,
        display_order=payload.display_order,
        is_active=True,
        color_hex=payload.color_hex,
        io_enabled=payload.io_enabled if payload.io_enabled is not None else True,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.patch("/reorder")
def reorder_departments(
    payload: DepartmentReorderPayload,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    reorder_by_display_order(
        db, Department, "id",
        [(item.id, item.display_order) for item in payload.items],
    )
    db.commit()
    return {"ok": True}


@router.put("/{dept_id}", response_model=DepartmentResponse)
def update_department(
    dept_id: int,
    payload: DepartmentUpdate,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise http_error(404, ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다.")
    display_name = payload.display_name if payload.display_name is not None else payload.name
    if display_name is not None:
        display_name = display_name.strip()
        if not display_name:
            raise http_error(422, ErrorCode.VALIDATION_ERROR, "부서 표시명을 입력하세요.")
        if db.query(Department).filter(
            func.coalesce(Department.display_name, Department.name) == display_name,
            Department.id != dept_id,
        ).first():
            raise http_error(409, ErrorCode.CONFLICT, "이미 존재하는 부서명입니다.")
        # name remains the immutable location/employee/approval key, including legacy PUT calls.
        dept.display_name = display_name
    if payload.display_order is not None:
        dept.display_order = payload.display_order
    if payload.is_active is not None:
        dept.is_active = payload.is_active
    if payload.color_hex is not None:
        dept.color_hex = payload.color_hex
    if payload.io_enabled is not None:
        dept.io_enabled = payload.io_enabled
    db.commit()
    db.refresh(dept)
    return dept


@router.delete("/{dept_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_department(
    dept_id: int,
    _admin: Annotated[None, Depends(require_admin_pin)],
    pin: Optional[str] = Query(
        None,
        description="관리자 PIN (deprecated — body 사용 권장)",
        deprecated=True,
    ),
    body: Optional[DepartmentDeleteRequest] = Body(None),
    db: Session = Depends(get_db),
):
    """관리자 PIN 으로 부서 삭제.

    PIN 은 request body(`{"pin": "..."}`) 로 전달하면 access log 에 남지 않는다.
    하위호환을 위해 body 가 없으면 query string `pin` 으로 폴백한다.
    """
    dept = db.query(Department).filter(Department.id == dept_id).first()
    if not dept:
        raise http_error(404, ErrorCode.NOT_FOUND, "부서를 찾을 수 없습니다.")
    dependencies = _department_dependencies(db, dept.name)
    if dependencies:
        reasons = ", ".join(f"{entry['label']} {entry['count']}건" for entry in dependencies)
        raise http_error(409, ErrorCode.CONFLICT, f"연결된 데이터가 있어 부서를 삭제할 수 없습니다: {reasons}", dependencies=dependencies)
    db.delete(dept)
    db.commit()
