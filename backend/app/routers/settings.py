"""System settings router."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SystemSetting
from app.schemas import AdminPinUpdateRequest, AdminPinVerifyRequest, MessageResponse

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
