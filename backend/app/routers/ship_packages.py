"""Shipment package router."""

from datetime import UTC, datetime
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, ShipPackage, ShipPackageItem
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    ShipPackageCreate,
    ShipPackageDetailResponse,
    ShipPackageItemCreate,
    ShipPackageResponse,
    ShipPackageUpdate,
)
from app.services._tx import commit_and_refresh, commit_only

router = APIRouter()


@router.get("", response_model=List[ShipPackageDetailResponse])
def list_packages(db: Session = Depends(get_db)):
    packages = db.query(ShipPackage).order_by(ShipPackage.updated_at.desc()).all()
    return [_to_detail_response(package) for package in packages]


@router.post("", response_model=ShipPackageResponse, status_code=status.HTTP_201_CREATED)
def create_package(payload: ShipPackageCreate, db: Session = Depends(get_db)):
    existing = db.query(ShipPackage).filter(ShipPackage.package_code == payload.package_code).first()
    if existing:
        raise http_error(409, ErrorCode.CONFLICT, "패키지 코드가 이미 존재합니다.")

    package = ShipPackage(
        package_code=payload.package_code,
        name=payload.name,
        notes=payload.notes,
    )
    db.add(package)
    commit_and_refresh(db, package)
    return package


@router.put("/{package_id}", response_model=ShipPackageResponse)
def update_package(package_id: uuid.UUID, payload: ShipPackageUpdate, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise http_error(404, ErrorCode.NOT_FOUND, "출하 패키지를 찾을 수 없습니다.")

    if payload.name is not None:
        package.name = payload.name
    if payload.notes is not None:
        package.notes = payload.notes
    package.updated_at = datetime.now(UTC).replace(tzinfo=None)
    commit_and_refresh(db, package)
    return package


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(package_id: uuid.UUID, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise http_error(404, ErrorCode.NOT_FOUND, "출하 패키지를 찾을 수 없습니다.")
    db.delete(package)
    commit_only(db)


@router.post("/{package_id}/items", response_model=ShipPackageDetailResponse, status_code=status.HTTP_201_CREATED)
def add_package_item(package_id: uuid.UUID, payload: ShipPackageItemCreate, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise http_error(404, ErrorCode.NOT_FOUND, "출하 패키지를 찾을 수 없습니다.")

    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")

    existing = (
        db.query(ShipPackageItem)
        .filter(ShipPackageItem.package_id == package_id, ShipPackageItem.item_id == payload.item_id)
        .first()
    )
    if existing:
        existing.quantity = payload.quantity
    else:
        db.add(
            ShipPackageItem(
                package_id=package_id,
                item_id=payload.item_id,
                quantity=payload.quantity,
            )
        )

    package.updated_at = datetime.now(UTC).replace(tzinfo=None)
    commit_and_refresh(db, package)
    return _to_detail_response(package)


@router.delete(
    "/{package_id}/items/{package_item_id}",
    response_model=ShipPackageDetailResponse,
    summary="패키지 품목 제거 후 갱신된 패키지 반환",
    description=(
        "child 1건을 삭제하고 갱신된 parent 를 반환합니다 (200 + body). "
        "child-delete 패턴 — pure DELETE (204) 는 `/{package_id}` 가 담당."
    ),
)
def delete_package_item(package_id: uuid.UUID, package_item_id: uuid.UUID, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise http_error(404, ErrorCode.NOT_FOUND, "출하 패키지를 찾을 수 없습니다.")

    package_item = db.query(ShipPackageItem).filter(ShipPackageItem.package_item_id == package_item_id).first()
    if not package_item:
        raise http_error(404, ErrorCode.NOT_FOUND, "패키지 품목을 찾을 수 없습니다.")

    db.delete(package_item)
    package.updated_at = datetime.now(UTC).replace(tzinfo=None)
    commit_and_refresh(db, package)
    return _to_detail_response(package)


def _to_detail_response(package: ShipPackage) -> ShipPackageDetailResponse:
    return ShipPackageDetailResponse(
        package_id=package.package_id,
        package_code=package.package_code,
        name=package.name,
        notes=package.notes,
        created_at=package.created_at,
        updated_at=package.updated_at,
        items=[
            {
                "package_item_id": item.package_item_id,
                "item_id": item.item_id,
                "erp_code": item.item.erp_code,
                "item_name": item.item.item_name,
                "item_category": item.item.category,
                "item_unit": item.item.unit,
                "quantity": item.quantity,
            }
            for item in package.items
        ],
    )
