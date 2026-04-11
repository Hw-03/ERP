"""Shipment package router."""

from datetime import UTC, datetime
import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, ShipPackage, ShipPackageItem
from app.schemas import (
    ShipPackageCreate,
    ShipPackageDetailResponse,
    ShipPackageItemCreate,
    ShipPackageResponse,
    ShipPackageUpdate,
)

router = APIRouter()


@router.get("/", response_model=List[ShipPackageDetailResponse])
def list_packages(db: Session = Depends(get_db)):
    packages = db.query(ShipPackage).order_by(ShipPackage.updated_at.desc()).all()
    return [_to_detail_response(package) for package in packages]


@router.post("/", response_model=ShipPackageResponse, status_code=status.HTTP_201_CREATED)
def create_package(payload: ShipPackageCreate, db: Session = Depends(get_db)):
    existing = db.query(ShipPackage).filter(ShipPackage.package_code == payload.package_code).first()
    if existing:
        raise HTTPException(status_code=409, detail="패키지 코드가 이미 존재합니다.")

    package = ShipPackage(
        package_code=payload.package_code,
        name=payload.name,
        notes=payload.notes,
    )
    db.add(package)
    db.commit()
    db.refresh(package)
    return package


@router.put("/{package_id}", response_model=ShipPackageResponse)
def update_package(package_id: uuid.UUID, payload: ShipPackageUpdate, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="출하 패키지를 찾을 수 없습니다.")

    if payload.name is not None:
        package.name = payload.name
    if payload.notes is not None:
        package.notes = payload.notes
    package.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(package)
    return package


@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(package_id: uuid.UUID, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="출하 패키지를 찾을 수 없습니다.")
    db.delete(package)
    db.commit()


@router.post("/{package_id}/items", response_model=ShipPackageDetailResponse, status_code=status.HTTP_201_CREATED)
def add_package_item(package_id: uuid.UUID, payload: ShipPackageItemCreate, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="출하 패키지를 찾을 수 없습니다.")

    item = db.query(Item).filter(Item.item_id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="품목을 찾을 수 없습니다.")

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
    db.commit()
    db.refresh(package)
    return _to_detail_response(package)


@router.delete("/{package_id}/items/{package_item_id}", response_model=ShipPackageDetailResponse)
def delete_package_item(package_id: uuid.UUID, package_item_id: uuid.UUID, db: Session = Depends(get_db)):
    package = db.query(ShipPackage).filter(ShipPackage.package_id == package_id).first()
    if not package:
        raise HTTPException(status_code=404, detail="출하 패키지를 찾을 수 없습니다.")

    package_item = db.query(ShipPackageItem).filter(ShipPackageItem.package_item_id == package_item_id).first()
    if not package_item:
        raise HTTPException(status_code=404, detail="패키지 품목을 찾을 수 없습니다.")

    db.delete(package_item)
    package.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    db.refresh(package)
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
                "item_code": item.item.item_code,
                "item_name": item.item.item_name,
                "item_category": item.item.category,
                "item_unit": item.item.unit,
                "quantity": item.quantity,
            }
            for item in package.items
        ],
    )
