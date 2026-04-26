"""System settings router.

관리자 PIN 인증 엔드포인트와 DB 재시드(안전 초기화), 재고 불변식 점검/복구 엔드포인트.
무결성 점검 · 복구는 운영자가 명시적으로 호출하는 관리자 도구이며 프론트엔드는 사용하지 않는다.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.database import get_db
from app.models import Inventory, SystemSetting
from app.schemas import AdminPinUpdateRequest, AdminPinVerifyRequest, MessageResponse
from app.services import audit
from app.services import integrity as integrity_svc


class ResetRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32, description="현재 관리자 PIN")


class IntegrityRepairRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)
    dry_run: bool = True

router = APIRouter()

ADMIN_PIN_KEY = "admin_pin"
DEFAULT_ADMIN_PIN = "0000"


def ensure_admin_pin(db: Session) -> SystemSetting:
    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == ADMIN_PIN_KEY).first()
    if setting:
        return setting

    setting = SystemSetting(setting_key=ADMIN_PIN_KEY, setting_value=DEFAULT_ADMIN_PIN)
    db.add(setting)
    db.commit()
    db.refresh(setting)
    return setting


@router.post("/verify-pin", response_model=MessageResponse)
def verify_admin_pin(payload: AdminPinVerifyRequest, db: Session = Depends(get_db)):
    setting = ensure_admin_pin(db)
    if payload.pin != setting.setting_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 비밀번호가 올바르지 않습니다.")
    return MessageResponse(message="관리자 인증이 완료되었습니다.")


@router.put("/admin-pin", response_model=MessageResponse)
def update_admin_pin(payload: AdminPinUpdateRequest, request: Request, db: Session = Depends(get_db)):
    setting = ensure_admin_pin(db)

    if payload.current_pin != setting.setting_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="현재 비밀번호가 올바르지 않습니다.")
    if payload.current_pin == payload.new_pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="새 비밀번호는 현재 비밀번호와 달라야 합니다.")

    setting.setting_value = payload.new_pin
    setting.updated_at = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="settings.pin_change",
        target_type="settings",
        target_id="admin_pin",
        payload_summary="관리자 PIN 변경",
    )

    db.commit()
    return MessageResponse(message="관리자 비밀번호를 변경했습니다.")


def _require_admin(db: Session, pin: str) -> None:
    setting = ensure_admin_pin(db)
    if pin != setting.setting_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 비밀번호가 올바르지 않습니다.")


@router.get("/integrity/inventory")
def check_inventory_integrity(
    pin: str = Query(..., min_length=4, max_length=32, description="관리자 PIN"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """재고 불변식(quantity == warehouse + Σ locations) 미스매치 목록.

    관리자 PIN 필요. 프론트에서 사용하지 않는 운영 도구.
    """
    _require_admin(db, pin)
    mismatches = integrity_svc.check_inventory_consistency(db)
    return {
        "checked": db.query(Inventory).count(),
        "mismatched_count": len(mismatches),
        "samples": [m.to_dict() for m in mismatches[:limit]],
    }


@router.post("/integrity/repair")
def repair_inventory_integrity(
    payload: IntegrityRepairRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """Inventory.quantity 를 warehouse + Σ locations 로 재계산해 복구.

    `dry_run=True` (기본) 로 먼저 확인 후 실제 적용 시 false 로 호출.
    """
    _require_admin(db, payload.pin)
    report = integrity_svc.repair_inventory_totals(db, dry_run=payload.dry_run)
    if not payload.dry_run:
        audit.record(
            db,
            request=request,
            action="settings.integrity_repair",
            target_type="settings",
            target_id="inventory",
            payload_summary=f"repaired {getattr(report, 'fixed_count', '?')} rows",
        )
        db.commit()
    return report.to_dict()


@router.post("/reset", response_model=MessageResponse)
def reset_database(payload: ResetRequest, request: Request, db: Session = Depends(get_db)):
    """PIN 검증 후 시드 데이터 재적재 (안전 초기화). 관리자 도구."""
    setting = ensure_admin_pin(db)
    if payload.pin != setting.setting_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 비밀번호가 올바르지 않습니다.")

    # reset 직전에 audit 1건 기록 (reset 자체는 시드 재적재로 audit_logs 도 비울 수 있어 사후 기록은 무의미).
    audit.record(
        db,
        request=request,
        action="settings.reset_db",
        target_type="settings",
        target_id="database",
        payload_summary="DB 초기화 + 시드 재적재 시작",
    )
    db.commit()

    try:
        import sys
        from pathlib import Path
        backend_dir = Path(__file__).resolve().parents[2]
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        import importlib
        import seed as seed_module
        importlib.reload(seed_module)
        seed_module.run_seed()
        return MessageResponse(message="데이터베이스를 초기화하고 시드를 재적재했습니다.")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"초기화 중 오류가 발생했습니다: {exc}",
        )
