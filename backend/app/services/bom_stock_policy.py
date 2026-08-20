"""BOM 자동 처리에서만 적용하는 재고 미반영 정책."""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from decimal import Decimal
from typing import Mapping, Protocol

from sqlalchemy.orm import Session

from app.models import BOM, SystemSetting


BOM_STOCK_EXEMPT_NOTE = "BOM 재고 미반영"
BOM_AUTO_ORIGIN = "bom_auto"
BOM_PARENT_SOURCE_KIND = "bom_parent"
BOM_AUTO_TOKEN_SETTING_KEY = "security.bom_auto_token_secret"


class BomStockPolicyItem(Protocol):
    """정책 판단에 필요한 품목 최소 계약."""

    bom_stock_exempt: bool


def should_skip_bom_inventory(
    item: BomStockPolicyItem,
    *,
    bom_generated: bool,
) -> bool:
    """수동 품목에는 영향을 주지 않고 자동 BOM 자재만 재고 반영에서 제외한다."""
    return bom_generated and bool(item.bom_stock_exempt)


def _token_claim_value(value: object) -> object:
    """서명 대상 값을 재시작·DB 방언과 무관한 JSON 값으로 정규화한다."""
    if isinstance(value, (uuid.UUID, Decimal)):
        return str(value)
    return value


def _token_payload(*, flow: str, claims: Mapping[str, object]) -> bytes:
    """자동 BOM 근거의 불변 식별자를 안정적으로 직렬화한다."""
    return json.dumps(
        {
            "flow": flow,
            "claims": {key: _token_claim_value(value) for key, value in sorted(claims.items())},
        },
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def _read_bom_auto_token_secret(db: Session) -> bytes | None:
    """DB별 서명 키를 부수 효과 없이 읽는다."""
    setting = db.query(SystemSetting).filter(
        SystemSetting.setting_key == BOM_AUTO_TOKEN_SETTING_KEY
    ).first()
    return setting.setting_value.encode("utf-8") if setting is not None else None


def _issue_bom_auto_token(
    db: Session,
    *,
    flow: str,
    claims: Mapping[str, object],
) -> str:
    """서버가 전개한 BOM 자동 라인에만 재사용 가능한 근거 토큰을 발급한다."""
    secret = _read_bom_auto_token_secret(db)
    if secret is None:
        raise RuntimeError("BOM auto token secret missing; run bootstrap.")
    return hmac.new(secret, _token_payload(flow=flow, claims=claims), hashlib.sha256).hexdigest()


def has_valid_bom_auto_token(
    db: Session,
    *,
    flow: str,
    claims: Mapping[str, object],
    token: object,
) -> bool:
    """전달된 자동 BOM 근거가 현재 DB의 서버 발급 값과 일치하는지 확인한다."""
    if not isinstance(token, str):
        return False
    secret = _read_bom_auto_token_secret(db)
    if secret is None:
        return False
    expected = hmac.new(secret, _token_payload(flow=flow, claims=claims), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, token)


def io_bom_auto_claims(
    *,
    bundle_id: object,
    line_id: object,
    source_kind: object,
    source_item_id: object,
    item_id: object,
    work_type: object,
    sub_type: object,
    direction: object,
    from_bucket: object,
    from_department: object,
    to_bucket: object,
    to_department: object,
) -> dict[str, object]:
    """입출고 미리보기에서 자동 전개한 BOM 행을 식별하는 불변 근거다."""
    return {
        "bundle_id": bundle_id,
        "line_id": line_id,
        "source_kind": source_kind,
        "source_item_id": source_item_id,
        "item_id": item_id,
        "work_type": work_type,
        "sub_type": sub_type,
        "direction": direction,
        "from_bucket": from_bucket,
        "from_department": from_department,
        "to_bucket": to_bucket,
        "to_department": to_department,
    }


def bom_template_claims(
    *,
    parent_item_id: object,
    item_id: object,
    quantity: object,
) -> dict[str, object]:
    """부서 조정·재작업 템플릿의 BOM 구조와 기준 수량을 식별한다."""
    return {
        "parent_item_id": parent_item_id,
        "item_id": item_id,
        "quantity": quantity,
    }


def is_bom_generated_line(
    db: Session,
    *,
    bundle_id: object,
    line_id: object,
    source_kind: object,
    source_item_id: object,
    item_id: object,
    work_type: object,
    sub_type: object,
    direction: object,
    from_bucket: object,
    from_department: object,
    to_bucket: object,
    to_department: object,
    bom_auto_token: object,
) -> bool:
    """저장·제출 라인이 서버 미리보기의 BOM 자동 자재인지 다시 확인한다."""
    if (
        source_kind != BOM_PARENT_SOURCE_KIND
        or source_item_id is None
        or item_id is None
    ):
        return False
    claims = io_bom_auto_claims(
        bundle_id=bundle_id,
        line_id=line_id,
        source_kind=source_kind,
        source_item_id=source_item_id,
        item_id=item_id,
        work_type=work_type,
        sub_type=sub_type,
        direction=direction,
        from_bucket=from_bucket,
        from_department=from_department,
        to_bucket=to_bucket,
        to_department=to_department,
    )
    if not has_valid_bom_auto_token(
        db,
        flow="io",
        claims=claims,
        token=bom_auto_token,
    ):
        return False
    return (
        db.query(BOM.bom_id)
        .filter(
            BOM.parent_item_id == source_item_id,
            BOM.child_item_id == item_id,
        )
        .first()
        is not None
    )
