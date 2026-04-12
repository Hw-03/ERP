"""System settings router."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.database import get_db
from app.models import SystemSetting
from app.schemas import AdminPinUpdateRequest, AdminPinVerifyRequest, MessageResponse


class ResetRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32, description="현재 관리자 PIN")

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
def update_admin_pin(payload: AdminPinUpdateRequest, db: Session = Depends(get_db)):
    setting = ensure_admin_pin(db)

    if payload.current_pin != setting.setting_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="현재 비밀번호가 올바르지 않습니다.")
    if payload.current_pin == payload.new_pin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="새 비밀번호는 현재 비밀번호와 달라야 합니다.")

    setting.setting_value = payload.new_pin
    setting.updated_at = datetime.now(UTC).replace(tzinfo=None)
    db.commit()
    return MessageResponse(message="관리자 비밀번호를 변경했습니다.")


@router.post("/reset", response_model=MessageResponse)
def reset_database(payload: ResetRequest, db: Session = Depends(get_db)):
    """PIN 검증 후 시드 데이터 재적재 (안전 초기화)."""
    setting = ensure_admin_pin(db)
    if payload.pin != setting.setting_value:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="관리자 비밀번호가 올바르지 않습니다.")

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
