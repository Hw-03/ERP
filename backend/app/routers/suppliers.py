"""원자재 입출고 공급업체 마스터 API."""

from __future__ import annotations

import unicodedata
import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Supplier
from app.routers._errors import ErrorCode, http_error
from app.schemas import SupplierCreate, SupplierResponse, SupplierUpdate
from app.services import audit

router = APIRouter()


def normalize_supplier_name(name: str) -> str:
    """공급업체 중복 판정에 쓰는 Unicode 정규화 키를 반환한다."""
    return unicodedata.normalize("NFKC", name).strip().casefold()


def _warehouse_manager(db: Session, employee_id: uuid.UUID) -> Employee:
    """활성 창고 정·부 담당자만 공급업체 관리자로 허용한다."""
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(employee.is_active) or (employee.warehouse_role or "none") not in {"primary", "deputy"}:
        raise http_error(403, ErrorCode.FORBIDDEN, "활성 창고 정·부 담당자만 공급업체를 관리할 수 있습니다.")
    return employee


def _active_employee(db: Session, employee_id: uuid.UUID) -> Employee:
    """반품 업체 선택에 필요한 활성 목록 조회자를 검증한다."""
    employee = db.get(Employee, employee_id)
    if employee is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "요청자(직원)를 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원은 공급업체를 조회할 수 없습니다.")
    return employee


def _supplier_manager(db: Session, employee_id: uuid.UUID, scope: str) -> Employee:
    """튜브 업체는 활성 튜브 직원, 창고 업체는 기존 정·부 담당자가 관리한다."""
    if scope == "warehouse":
        return _warehouse_manager(db, employee_id)
    employee = _active_employee(db, employee_id)
    if getattr(employee.department, "value", employee.department) != "튜브":
        raise http_error(403, ErrorCode.FORBIDDEN, "활성 튜브 직원만 튜브 공급업체를 관리할 수 있습니다.")
    return employee


@router.get("", response_model=list[SupplierResponse])
def list_suppliers(requester_employee_id: uuid.UUID = Query(...), include_inactive: bool = Query(False), scope: Literal["warehouse", "tube"] = Query("warehouse"), db: Session = Depends(get_db)) -> list[Supplier]:
    if include_inactive:
        _supplier_manager(db, requester_employee_id, scope)
    else:
        _active_employee(db, requester_employee_id)
    query = db.query(Supplier).filter(Supplier.scope == scope)
    if not include_inactive:
        query = query.filter(Supplier.is_active.is_(True))
    return query.order_by(Supplier.name.asc(), Supplier.supplier_id.asc()).all()


@router.post("", response_model=SupplierResponse, status_code=status.HTTP_201_CREATED)
def create_supplier(payload: SupplierCreate, request: Request, db: Session = Depends(get_db)) -> Supplier:
    actor = _supplier_manager(db, payload.requester_employee_id, payload.scope)
    normalized_name = normalize_supplier_name(payload.name)
    if db.query(Supplier.supplier_id).filter(Supplier.scope == payload.scope, Supplier.normalized_name == normalized_name).first():
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 공급업체가 이미 존재합니다.")
    supplier = Supplier(name=payload.name, normalized_name=normalized_name, scope=payload.scope, is_active=True)
    db.add(supplier)
    try:
        db.flush()
        audit.record(db, request=request, action="supplier.create", target_type="supplier", target_id=str(supplier.supplier_id), payload_summary=supplier.name, actor_employee_code=actor.employee_code)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 공급업체가 이미 존재합니다.")
    db.refresh(supplier)
    return supplier


@router.patch("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(supplier_id: uuid.UUID, payload: SupplierUpdate, request: Request, db: Session = Depends(get_db)) -> Supplier:
    supplier = db.get(Supplier, supplier_id)
    if supplier is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "공급업체를 찾을 수 없습니다.")
    actor = _supplier_manager(db, payload.requester_employee_id, supplier.scope)
    changes: list[str] = []
    if payload.name is not None:
        normalized_name = normalize_supplier_name(payload.name)
        duplicate = db.query(Supplier.supplier_id).filter(Supplier.scope == supplier.scope, Supplier.normalized_name == normalized_name, Supplier.supplier_id != supplier_id).first()
        if duplicate is not None:
            raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 공급업체가 이미 존재합니다.")
        if supplier.name != payload.name:
            supplier.name = payload.name
            supplier.normalized_name = normalized_name
            changes.append("name")
    if payload.is_active is not None and bool(supplier.is_active) != payload.is_active:
        supplier.is_active = payload.is_active
        changes.append("reactivate" if payload.is_active else "hide")
    if changes:
        audit.record(db, request=request, action="supplier.update", target_type="supplier", target_id=str(supplier.supplier_id), payload_summary=f"{supplier.name}: {', '.join(changes)}", actor_employee_code=actor.employee_code)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise http_error(409, ErrorCode.CONFLICT, "같은 이름의 공급업체가 이미 존재합니다.")
        db.refresh(supplier)
    return supplier
