"""
Shipping Router — 출하묶음 관리 및 일괄 출하
"""

import uuid
from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Item, Inventory, TransactionLog, TransactionTypeEnum
from app.models import ShippingPackage, ShippingPackageItem
from app.schemas import (
    ShippingPackageCreate, ShippingPackageUpdate,
    ShippingPackageResponse, ShippingPackageItemCreate,
    ShipPackageRequest, MessageResponse,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# GET / — 출하묶음 목록
# ---------------------------------------------------------------------------

@router.get("/", response_model=List[ShippingPackageResponse])
def list_packages(db: Session = Depends(get_db)):
    """출하묶음 목록 조회."""
    packages = db.query(ShippingPackage).order_by(ShippingPackage.name).all()
    result = []
    for pkg in packages:
        pkg_resp = ShippingPackageResponse(
            package_id=pkg.package_id,
            name=pkg.name,
            notes=pkg.notes,
            created_at=pkg.created_at,
            package_items=[
                _enrich_package_item(pi, db) for pi in pkg.package_items
            ],
        )
        result.append(pkg_resp)
    return result


# ---------------------------------------------------------------------------
# POST / — 출하묶음 생성
# ---------------------------------------------------------------------------

@router.post("/", response_model=ShippingPackageResponse, status_code=status.HTTP_201_CREATED)
def create_package(payload: ShippingPackageCreate, db: Session = Depends(get_db)):
    """출하묶음 등록."""
    existing = db.query(ShippingPackage).filter(ShippingPackage.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"묶음 이름 '{payload.name}'이 이미 존재합니다."
        )

    pkg = ShippingPackage(name=payload.name, notes=payload.notes)
    db.add(pkg)
    db.flush()

    for item_data in payload.items:
        _validate_item(item_data.item_id, db)
        db.add(ShippingPackageItem(
            package_id=pkg.package_id,
            item_id=item_data.item_id,
            quantity=item_data.quantity,
            unit=item_data.unit,
        ))

    db.commit()
    db.refresh(pkg)
    return _build_package_response(pkg, db)


# ---------------------------------------------------------------------------
# GET /{package_id} — 단일 조회
# ---------------------------------------------------------------------------

@router.get("/{package_id}", response_model=ShippingPackageResponse)
def get_package(package_id: uuid.UUID, db: Session = Depends(get_db)):
    pkg = _get_or_404(package_id, db)
    return _build_package_response(pkg, db)


# ---------------------------------------------------------------------------
# PUT /{package_id} — 묶음 기본 정보 수정
# ---------------------------------------------------------------------------

@router.put("/{package_id}", response_model=ShippingPackageResponse)
def update_package(
    package_id: uuid.UUID,
    payload: ShippingPackageUpdate,
    db: Session = Depends(get_db),
):
    pkg = _get_or_404(package_id, db)
    if payload.name is not None:
        existing = db.query(ShippingPackage).filter(
            ShippingPackage.name == payload.name,
            ShippingPackage.package_id != package_id,
        ).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"묶음 이름 '{payload.name}'이 이미 존재합니다.")
        pkg.name = payload.name
    if payload.notes is not None:
        pkg.notes = payload.notes
    db.commit()
    db.refresh(pkg)
    return _build_package_response(pkg, db)


# ---------------------------------------------------------------------------
# POST /{package_id}/items — 구성 품목 추가
# ---------------------------------------------------------------------------

@router.post("/{package_id}/items", response_model=ShippingPackageResponse)
def add_package_item(
    package_id: uuid.UUID,
    payload: ShippingPackageItemCreate,
    db: Session = Depends(get_db),
):
    pkg = _get_or_404(package_id, db)
    _validate_item(payload.item_id, db)

    existing = db.query(ShippingPackageItem).filter(
        ShippingPackageItem.package_id == package_id,
        ShippingPackageItem.item_id == payload.item_id,
    ).first()
    if existing:
        existing.quantity = payload.quantity
        existing.unit = payload.unit
    else:
        db.add(ShippingPackageItem(
            package_id=package_id,
            item_id=payload.item_id,
            quantity=payload.quantity,
            unit=payload.unit,
        ))
    db.commit()
    db.refresh(pkg)
    return _build_package_response(pkg, db)


# ---------------------------------------------------------------------------
# DELETE /{package_id}/items/{item_id} — 구성 품목 제거
# ---------------------------------------------------------------------------

@router.delete("/{package_id}/items/{item_id}", response_model=ShippingPackageResponse)
def remove_package_item(
    package_id: uuid.UUID,
    item_id: uuid.UUID,
    db: Session = Depends(get_db),
):
    pkg = _get_or_404(package_id, db)
    pi = db.query(ShippingPackageItem).filter(
        ShippingPackageItem.package_id == package_id,
        ShippingPackageItem.item_id == item_id,
    ).first()
    if not pi:
        raise HTTPException(status_code=404, detail="해당 품목이 묶음에 없습니다.")
    db.delete(pi)
    db.commit()
    db.refresh(pkg)
    return _build_package_response(pkg, db)


# ---------------------------------------------------------------------------
# POST /ship — 출하묶음 일괄 출하
# ---------------------------------------------------------------------------

@router.post("/ship", response_model=MessageResponse, status_code=status.HTTP_201_CREATED)
def ship_package(payload: ShipPackageRequest, db: Session = Depends(get_db)):
    """
    출하묶음의 모든 구성 품목을 원자적으로 일괄 출하.
    재고 부족 시 전체 롤백 + 오류 반환.
    """
    pkg = _get_or_404(payload.package_id, db)

    if not pkg.package_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="출하묶음에 구성 품목이 없습니다."
        )

    # 재고 충분 여부 사전 검증
    shortages = []
    for pi in pkg.package_items:
        inv = db.query(Inventory).filter(Inventory.item_id == pi.item_id).first()
        current = inv.quantity if inv else Decimal("0")
        if current < pi.quantity:
            item = db.query(Item).filter(Item.item_id == pi.item_id).first()
            shortages.append(
                f"[{item.item_code}] {item.item_name}: "
                f"필요 {pi.quantity}, 현재 {current} (부족: {pi.quantity - current})"
            )

    if shortages:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"message": "재고 부족으로 출하할 수 없습니다.", "shortages": shortages}
        )

    # 원자적 차감
    shipped_count = 0
    try:
        for pi in pkg.package_items:
            inv = db.query(Inventory).filter(Inventory.item_id == pi.item_id).first()
            qty_before = inv.quantity
            inv.quantity = qty_before - pi.quantity

            db.add(TransactionLog(
                item_id=pi.item_id,
                transaction_type=TransactionTypeEnum.SHIP,
                quantity_change=-pi.quantity,
                quantity_before=qty_before,
                quantity_after=inv.quantity,
                reference_no=payload.reference_no,
                produced_by=payload.produced_by,
                notes=payload.notes or f"출하묶음: {pkg.name}",
            ))
            shipped_count += 1

        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"출하 처리 중 오류가 발생했습니다: {str(exc)}"
        )

    return MessageResponse(
        message=f"'{pkg.name}' 출하묶음 출하 완료. {shipped_count}개 품목 차감."
    )


# ---------------------------------------------------------------------------
# DELETE /{package_id} — 묶음 삭제
# ---------------------------------------------------------------------------

@router.delete("/{package_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_package(package_id: uuid.UUID, db: Session = Depends(get_db)):
    pkg = _get_or_404(package_id, db)
    db.delete(pkg)
    db.commit()


# ---------------------------------------------------------------------------
# 내부 헬퍼
# ---------------------------------------------------------------------------

def _get_or_404(package_id: uuid.UUID, db: Session) -> ShippingPackage:
    pkg = db.query(ShippingPackage).filter(ShippingPackage.package_id == package_id).first()
    if not pkg:
        raise HTTPException(status_code=404, detail="출하묶음을 찾을 수 없습니다.")
    return pkg


def _validate_item(item_id: uuid.UUID, db: Session) -> Item:
    item = db.query(Item).filter(Item.item_id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"품목 {item_id}을 찾을 수 없습니다.")
    return item


def _enrich_package_item(pi: ShippingPackageItem, db: Session):
    from app.schemas import ShippingPackageItemResponse
    item = db.query(Item).filter(Item.item_id == pi.item_id).first()
    return ShippingPackageItemResponse(
        id=pi.id,
        package_id=pi.package_id,
        item_id=pi.item_id,
        quantity=pi.quantity,
        unit=pi.unit,
        item_code=item.item_code if item else None,
        item_name=item.item_name if item else None,
    )


def _build_package_response(pkg: ShippingPackage, db: Session):
    from app.schemas import ShippingPackageResponse
    return ShippingPackageResponse(
        package_id=pkg.package_id,
        name=pkg.name,
        notes=pkg.notes,
        created_at=pkg.created_at,
        package_items=[_enrich_package_item(pi, db) for pi in pkg.package_items],
    )
