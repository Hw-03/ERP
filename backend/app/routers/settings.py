"""System settings router.

관리자 PIN 인증 엔드포인트와 DB 재시드(안전 초기화), 재고 불변식 점검/복구 엔드포인트.
무결성 점검 · 복구는 운영자가 명시적으로 호출하는 관리자 도구이며 프론트엔드는 사용하지 않는다.
"""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.database import get_db
from app.models import Inventory, SystemSetting
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    AdminPinUpdateRequest,
    AdminPinVerifyRequest,
    IntegrityCheckResponse,
    IntegrityRepairResponse,
    MessageResponse,
)
from app.services import audit
from app.services import integrity as integrity_svc
from app.services._tx import commit_and_refresh, commit_only
from app.services.pin_auth import hash_pin


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

    setting = SystemSetting(setting_key=ADMIN_PIN_KEY, setting_value=hash_pin(DEFAULT_ADMIN_PIN))
    db.add(setting)
    commit_and_refresh(db, setting)
    return setting


def _is_hashed(value: str) -> bool:
    return len(value) == 64 and all(c in "0123456789abcdef" for c in value)


def _matches_admin_pin(db: Session, setting: SystemSetting, input_pin: str) -> bool:
    """PIN 비교. 평문 발견 시 자동 해시화(lazy migration)."""
    stored = setting.setting_value
    if _is_hashed(stored):
        return stored == hash_pin(input_pin)
    # 평문 → 비교 후 일치하면 즉시 해시화
    if stored == input_pin:
        setting.setting_value = hash_pin(input_pin)
        setting.updated_at = datetime.now(UTC).replace(tzinfo=None)
        commit_only(db)
        return True
    return False


@router.post("/verify-pin", response_model=MessageResponse)
def verify_admin_pin(payload: AdminPinVerifyRequest, db: Session = Depends(get_db)):
    setting = ensure_admin_pin(db)
    if not _matches_admin_pin(db, setting, payload.pin):
        raise http_error(403, ErrorCode.BAD_REQUEST, "관리자 비밀번호가 올바르지 않습니다.")
    return MessageResponse(message="관리자 인증이 완료되었습니다.")


@router.put("/admin-pin", response_model=MessageResponse)
def update_admin_pin(payload: AdminPinUpdateRequest, request: Request, db: Session = Depends(get_db)):
    setting = ensure_admin_pin(db)

    if not _matches_admin_pin(db, setting, payload.current_pin):
        raise http_error(403, ErrorCode.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다.")
    if payload.current_pin == payload.new_pin:
        raise http_error(400, ErrorCode.BUSINESS_RULE, "새 비밀번호는 현재 비밀번호와 달라야 합니다.")

    setting.setting_value = hash_pin(payload.new_pin)
    setting.updated_at = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="settings.pin_change",
        target_type="settings",
        target_id="admin_pin",
        payload_summary="관리자 PIN 변경",
    )

    commit_only(db)
    return MessageResponse(message="관리자 비밀번호를 변경했습니다.")


def require_admin(db: Session, pin: str) -> None:
    """관리자 PIN 검증. 일치하지 않으면 403."""
    setting = ensure_admin_pin(db)
    if not _matches_admin_pin(db, setting, pin):
        raise http_error(403, ErrorCode.BAD_REQUEST, "관리자 비밀번호가 올바르지 않습니다.")


# 내부 호환 alias
_require_admin = require_admin


@router.get("/integrity/inventory", response_model=IntegrityCheckResponse)
def check_inventory_integrity(
    pin: str = Query(..., min_length=4, max_length=32, description="관리자 PIN"),
    limit: int = Query(100, ge=1, le=2000),
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


@router.post("/integrity/repair", response_model=IntegrityRepairResponse)
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
        commit_only(db)
    return report.to_dict()


@router.post("/reset", response_model=MessageResponse)
def reset_database(payload: ResetRequest, request: Request, db: Session = Depends(get_db)):
    """PIN 검증 후 시드 데이터 재적재 (안전 초기화). 관리자 도구."""
    setting = ensure_admin_pin(db)
    if not _matches_admin_pin(db, setting, payload.pin):
        raise http_error(403, ErrorCode.BAD_REQUEST, "관리자 비밀번호가 올바르지 않습니다.")

    # reset 직전에 audit 1건 기록 (reset 자체는 시드 재적재로 audit_logs 도 비울 수 있어 사후 기록은 무의미).
    audit.record(
        db,
        request=request,
        action="settings.reset_db",
        target_type="settings",
        target_id="database",
        payload_summary="DB 초기화 + 시드 재적재 시작",
    )
    commit_only(db)

    try:
        from app.models import Inventory as _Inv, InventoryLocation as _Loc, Item as _Item
        from app.services.seed_cleanup import run_cleanup_import

        # 품목·재고 데이터 초기화 (참조 데이터 — Employee/ProcessType 등은 유지)
        db.query(_Loc).delete(synchronize_session=False)
        db.query(_Inv).delete(synchronize_session=False)
        db.query(_Item).delete(synchronize_session=False)
        db.commit()

        result = run_cleanup_import(db)
        msg = f"데이터베이스를 초기화하고 722 정리본을 재적재했습니다. (rows={result['rows']}, total_qty={result['total_qty']})"
        return MessageResponse(message=msg)
    except Exception as exc:
        raise http_error(500, ErrorCode.INTERNAL, f"초기화 중 오류가 발생했습니다: {exc}")
