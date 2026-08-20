"""System settings router.

관리자 PIN 인증 엔드포인트와 DB 재시드(안전 초기화), 재고 불변식 점검/복구 엔드포인트.
무결성 점검 · 복구는 운영자가 명시적으로 호출하는 관리자 도구이며 프론트엔드는 사용하지 않는다.
"""

import hashlib
import hmac
import logging
from datetime import UTC, datetime

from typing import Optional

from fastapi import Body, Depends, Header, Query, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from pydantic import BaseModel, Field

from app.database import get_db
from app.dependencies.verified_actor import CurrentActor, VerifiedActor, VerifiedActorRouter
from app.models import Employee, Inventory, SystemSetting
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    AdminPinUpdateRequest,
    AdminPinVerifyRequest,
    IntegrityCheckBody,
    IntegrityCheckRequest,
    IntegrityCheckResponse,
    IntegrityRepairResponse,
    MessageResponse,
)
from app.services import audit, rate_limit
from app.services import integrity as integrity_svc
from app.services._tx import commit_and_refresh, commit_only
from app.services.pin_auth import (
    PBKDF2_ALGORITHM,
    verify_pin,
)

logger = logging.getLogger("mes")



class IntegrityRepairRequest(BaseModel):
    pin: str = Field(..., min_length=4, max_length=32)
    dry_run: bool = True

router = VerifiedActorRouter()

ADMIN_PIN_KEY = "admin_pin"
DEFAULT_ADMIN_PIN = "0000"
ADMIN_PIN_LOCK_NAME = "dexcowin:admin_pin"
ADMIN_PIN_MIN_LENGTH = 4
ADMIN_PIN_MAX_LENGTH = 32


def _hash_admin_pin(pin: str) -> str:
    """롤백 가능한 기존 관리자 credential 형식으로 PIN을 해시한다."""
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def _is_admin_pin_hash(value: str) -> bool:
    return len(value) == 64 and all(character in "0123456789abcdef" for character in value)


def _admit_admin_pin_attempt(request: Request, actor: Employee) -> str:
    """모든 관리자 PIN endpoint에 같은 원자 실패 제한을 적용한다."""
    rate_key = rate_limit.admin_credential_key(request, actor.employee_id)
    if not rate_limit.admit_attempt(rate_key):
        raise http_error(
            429,
            ErrorCode.TOO_MANY_REQUESTS,
            "관리자 PIN 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        )
    return rate_key


def _lock_admin_pin_credential(db: Session) -> None:
    """PostgreSQL에서 행 부재까지 포함한 전역 관리자 PIN 변경을 직렬화한다."""
    if db.get_bind().dialect.name == "postgresql":
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:lock_name))"),
            {"lock_name": ADMIN_PIN_LOCK_NAME},
        )


def _matches_legacy_plaintext_admin_pin(stored: str, input_pin: str) -> bool:
    """명시된 과거 plaintext 범위만 비교해 verifier 원문 제출을 거부한다."""
    if stored.lower().startswith(PBKDF2_ALGORITHM):
        return False
    if not ADMIN_PIN_MIN_LENGTH <= len(stored) <= ADMIN_PIN_MAX_LENGTH:
        return False
    return hmac.compare_digest(stored, input_pin)


def _matches_admin_pin_value(stored: str, input_pin: str) -> bool:
    """관리자 전용 SHA-256, 복구용 PBKDF2, 과거 평문을 안전하게 검증한다."""
    if _is_admin_pin_hash(stored):
        return hmac.compare_digest(stored, _hash_admin_pin(input_pin))
    if stored.startswith(f"{PBKDF2_ALGORITHM}$"):
        return verify_pin(stored, input_pin)
    return _matches_legacy_plaintext_admin_pin(stored, input_pin)


def ensure_admin_pin(
    db: Session,
    *,
    commit_if_created: bool = True,
    lock_for_update: bool = False,
) -> SystemSetting:
    """관리자 PIN 설정을 반환하고 요청한 credential 잠금을 유지한다."""
    if lock_for_update:
        _lock_admin_pin_credential(db)
    pending = next(
        (
            row
            for row in db.new
            if isinstance(row, SystemSetting) and row.setting_key == ADMIN_PIN_KEY
        ),
        None,
    )
    if pending is not None:
        return pending
    query = db.query(SystemSetting).filter(SystemSetting.setting_key == ADMIN_PIN_KEY)
    if lock_for_update:
        query = query.with_for_update()
    setting = query.first()
    if setting:
        return setting

    setting = SystemSetting(
        setting_key=ADMIN_PIN_KEY,
        setting_value=_hash_admin_pin(DEFAULT_ADMIN_PIN),
    )
    db.add(setting)
    if commit_if_created:
        commit_and_refresh(db, setting)
    return setting


def _matches_admin_pin(
    db: Session,
    setting: SystemSetting,
    input_pin: str,
    *,
    migrate_plaintext: bool = True,
    commit_migration: bool = True,
) -> bool:
    """PIN을 비교하고 legacy 값을 롤백 가능한 관리자 전용 hash로 바꾼다."""
    stored = setting.setting_value
    if not _matches_admin_pin_value(stored, input_pin):
        return False

    needs_rollback_compatible_storage = not _is_admin_pin_hash(stored)
    if migrate_plaintext and needs_rollback_compatible_storage:
        setting.setting_value = _hash_admin_pin(input_pin)
        setting.updated_at = datetime.now(UTC).replace(tzinfo=None)
        if commit_migration:
            commit_only(db)
    return True


@router.post("/verify-pin", response_model=MessageResponse)
def verify_admin_pin(
    payload: AdminPinVerifyRequest,
    request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    rate_key = _admit_admin_pin_attempt(request, actor)
    setting = ensure_admin_pin(
        db,
        commit_if_created=False,
        lock_for_update=True,
    )
    if not _matches_admin_pin(
        db,
        setting,
        payload.pin,
        commit_migration=False,
    ):
        raise http_error(403, ErrorCode.BAD_REQUEST, "관리자 비밀번호가 올바르지 않습니다.")
    commit_only(db)
    rate_limit.record_success(rate_key)
    return MessageResponse(message="관리자 인증이 완료되었습니다.")


@router.put("/admin-pin", response_model=MessageResponse)
def update_admin_pin(
    payload: AdminPinUpdateRequest,
    request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    rate_key = _admit_admin_pin_attempt(request, actor)
    setting = ensure_admin_pin(
        db,
        commit_if_created=False,
        lock_for_update=True,
    )

    if not _matches_admin_pin(
        db,
        setting,
        payload.current_pin,
        commit_migration=False,
    ):
        raise http_error(403, ErrorCode.BAD_REQUEST, "현재 비밀번호가 올바르지 않습니다.")
    rate_limit.record_success(rate_key)
    if payload.current_pin == payload.new_pin:
        raise http_error(400, ErrorCode.BUSINESS_RULE, "새 비밀번호는 현재 비밀번호와 달라야 합니다.")

    setting.setting_value = _hash_admin_pin(payload.new_pin)
    setting.updated_at = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="settings.pin_change",
        target_type="settings",
        target_id="admin_pin",
        payload_summary="관리자 PIN 변경",
    )

    try:
        db.flush()
        commit_only(db)
    except Exception:
        db.rollback()
        raise
    return MessageResponse(message="관리자 비밀번호를 변경했습니다.")


def require_admin(
    db: Session,
    pin: str,
    *,
    migrate_plaintext: bool = True,
    commit_lazy_changes: bool = True,
) -> None:
    """관리자 PIN 검증. 일치하지 않으면 403."""
    setting = ensure_admin_pin(
        db,
        commit_if_created=False,
        lock_for_update=True,
    )
    if not _matches_admin_pin(
        db,
        setting,
        pin,
        migrate_plaintext=migrate_plaintext,
        commit_migration=False,
    ):
        raise http_error(403, ErrorCode.BAD_REQUEST, "관리자 비밀번호가 올바르지 않습니다.")
    if commit_lazy_changes:
        commit_only(db)


def require_admin_readonly(db: Session, pin: str) -> None:
    """DB 상태를 만들거나 변경하지 않고 관리자 PIN만 검증한다."""

    setting = db.query(SystemSetting).filter(SystemSetting.setting_key == ADMIN_PIN_KEY).first()
    stored = setting.setting_value if setting is not None else DEFAULT_ADMIN_PIN
    if not _matches_admin_pin_value(stored, pin):
        raise http_error(403, ErrorCode.BAD_REQUEST, "관리자 비밀번호가 올바르지 않습니다.")


# 내부 호환 alias
_require_admin = require_admin


def _inventory_integrity_payload(db: Session, limit: int) -> dict:
    mismatches = integrity_svc.check_inventory_consistency(db)
    return {
        "checked": db.query(Inventory).count(),
        "mismatched_count": len(mismatches),
        "samples": [m.to_dict() for m in mismatches[:limit]],
    }


@router.get("/integrity/inventory", response_model=IntegrityCheckResponse, deprecated=True)
def check_inventory_integrity(
    request: Request,
    actor: CurrentActor,
    x_admin_pin: Optional[str] = Header(None, alias="X-Admin-Pin"),
    limit: int = Query(100, ge=1, le=2000),
    body: Optional[IntegrityCheckBody] = Body(None),
    db: Session = Depends(get_db),
):
    """Deprecated compatibility endpoint.

    PIN은 access log에 남지 않는 `X-Admin-Pin` 헤더 또는 request body로만 받는다.
    """
    effective_pin = x_admin_pin or (body.pin if body and body.pin else None)
    if not effective_pin:
        raise http_error(400, ErrorCode.BAD_REQUEST, "관리자 PIN 이 필요합니다.")
    rate_key = _admit_admin_pin_attempt(request, actor)
    require_admin_readonly(db, effective_pin)
    rate_limit.record_success(rate_key)
    return _inventory_integrity_payload(db, limit)


@router.post("/integrity/inventory", response_model=IntegrityCheckResponse)
def check_inventory_integrity_post(
    payload: IntegrityCheckRequest,
    request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    """재고 불변식(quantity == warehouse + Σ locations) 미스매치 목록.

    관리자 PIN 은 request body 로 전달한다. 신규 호출의 기준 엔드포인트.
    """
    rate_key = _admit_admin_pin_attempt(request, actor)
    _require_admin(db, payload.pin)
    rate_limit.record_success(rate_key)
    return _inventory_integrity_payload(db, payload.limit)


@router.post("/integrity/repair", response_model=IntegrityRepairResponse)
def repair_inventory_integrity(
    payload: IntegrityRepairRequest,
    request: Request,
    actor: VerifiedActor,
    db: Session = Depends(get_db),
):
    """Inventory.quantity 를 warehouse + Σ locations 로 재계산해 복구.

    `dry_run=True` (기본) 로 먼저 확인 후 실제 적용 시 false 로 호출.
    """
    rate_key = _admit_admin_pin_attempt(request, actor)
    _require_admin(
        db,
        payload.pin,
        migrate_plaintext=not payload.dry_run,
        commit_lazy_changes=False,
    )
    rate_limit.record_success(rate_key)
    report = integrity_svc.repair_inventory_totals(
        db,
        actor=actor,
        dry_run=payload.dry_run,
    )
    if not payload.dry_run:
        audit.record(
            db,
            request=request,
            action="settings.integrity_repair",
            target_type="settings",
            target_id="inventory",
            payload_summary=f"repaired {report.repaired} rows",
        )
        db.flush()
        commit_only(db)
    return report.to_dict()
