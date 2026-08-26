"""관리자용 읽기 전용 재고·취소 정합성 진단 API."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.schemas.inventory_integrity import InventoryIntegrityResponse
from app.services.inventory_integrity import diagnose_inventory_integrity


router = APIRouter()


@router.get(
    "/inventory-integrity",
    response_model=InventoryIntegrityResponse,
    dependencies=[Depends(require_admin_pin)],
)
def get_inventory_integrity(
    db: Annotated[Session, Depends(get_db)],
) -> InventoryIntegrityResponse:
    """재고·불량·취소·주간 분류 불변식을 변경 없이 검사한다."""
    return diagnose_inventory_integrity(db)
