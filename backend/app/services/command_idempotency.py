"""업무 명령의 semantic idempotency 지문과 충돌 판정."""

from __future__ import annotations

from enum import Enum
import hashlib
import json
from typing import Any, Mapping
import uuid

from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session


IO_SUBMIT_ROUTE = "/api/io/submit"
IO_DRAFT_SUBMIT_ROUTE = "/api/io/draft/{batch_id}/submit"
STOCK_REQUEST_CREATE_ROUTE = "/api/stock-requests"
_ADVISORY_LOCK_NAMESPACE = "dexcowin-mes:command-idempotency:"


class IdempotencyConflict(Exception):
    """같은 transport key가 다른 업무 명령을 가리킬 때 발생한다."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


def lock_idempotency_key(db: Session, client_request_id: str) -> None:
    """PostgreSQL transaction 안에서 route 공통 key 소유권을 직렬화한다."""
    if db.get_bind().dialect.name != "postgresql":
        return
    digest = hashlib.sha256(
        f"{_ADVISORY_LOCK_NAMESPACE}{client_request_id}".encode("utf-8")
    ).digest()
    lock_id = int.from_bytes(digest[:8], byteorder="big", signed=True)
    db.execute(
        text("SELECT pg_advisory_xact_lock(:lock_id)"),
        {"lock_id": lock_id},
    )


def _plain(value: Any) -> Any:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return {str(key): _plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(item) for item in value]
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, uuid.UUID):
        return str(value)
    return value


def _sha256(payload: Mapping[str, Any]) -> str:
    encoded = json.dumps(
        _plain(payload),
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _io_line(line: Mapping[str, Any]) -> dict[str, Any]:
    fields = (
        "line_id",
        "item_id",
        "direction",
        "from_bucket",
        "from_department",
        "to_bucket",
        "to_department",
        "quantity",
        "bom_expected",
        "bom_stock_exempt",
        "bom_auto_token",
        "included",
        "selected",
        "origin",
        "edited",
        "exclusion_note",
    )
    return {field: line.get(field) for field in fields}


def _io_bundle(bundle: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "bundle_id": bundle.get("bundle_id"),
        "source_kind": bundle.get("source_kind"),
        "source_item_id": bundle.get("source_item_id"),
        "quantity": bundle.get("quantity"),
        "expanded_level": bundle.get("expanded_level"),
        "internal_use_bom_mode": bundle.get("internal_use_bom_mode"),
        "source_location": bundle.get("source_location"),
        # bundles와 lines는 업무 순서가 있으므로 입력 순서를 그대로 보존한다.
        "lines": [_io_line(line) for line in bundle.get("lines", ())],
    }


def fingerprint_io_submit(
    actor_employee_id: uuid.UUID,
    payload: BaseModel | Mapping[str, Any],
    *,
    route: str = IO_SUBMIT_ROUTE,
) -> str:
    """IO 제출에서 재고 의미가 같은 명령만 같은 SHA-256을 반환한다."""
    data = _plain(payload)
    return _sha256(
        {
            "actor_employee_id": actor_employee_id,
            "route": route,
            "command": "submit",
            "payload": {
                "work_type": data.get("work_type"),
                "sub_type": data.get("sub_type"),
                "from_department": data.get("from_department"),
                "to_department": data.get("to_department"),
                "reference_no": data.get("reference_no"),
                "notes": data.get("notes"),
                "bundles": [_io_bundle(bundle) for bundle in data.get("bundles", ())],
            },
        }
    )


def fingerprint_io_draft_submit(
    actor_employee_id: uuid.UUID,
    batch_id: uuid.UUID,
    payload: BaseModel | Mapping[str, Any],
    *,
    route: str = IO_DRAFT_SUBMIT_ROUTE,
) -> str:
    """기존 draft 제출을 actor·route·batch·저장 내용에 묶는다."""
    data = _plain(payload)
    return _sha256(
        {
            "actor_employee_id": actor_employee_id,
            "route": route,
            "command": "submit_existing_draft",
            "batch_id": batch_id,
            "payload": {
                "work_type": data.get("work_type"),
                "sub_type": data.get("sub_type"),
                "from_department": data.get("from_department"),
                "to_department": data.get("to_department"),
                "reference_no": data.get("reference_no"),
                "notes": data.get("notes"),
                "bundles": [_io_bundle(bundle) for bundle in data.get("bundles", ())],
            },
        }
    )


def _stock_line(line: Mapping[str, Any]) -> dict[str, Any]:
    fields = (
        "record_id",
        "item_id",
        "quantity",
        "from_bucket",
        "from_department",
        "to_bucket",
        "to_department",
    )
    return {field: line.get(field) for field in fields}


def fingerprint_stock_request_create(
    actor_employee_id: uuid.UUID,
    payload: BaseModel | Mapping[str, Any],
    *,
    route: str = STOCK_REQUEST_CREATE_ROUTE,
) -> str:
    """StockRequest 생성의 actor·route·업무 payload를 지문화한다."""
    data = _plain(payload)
    return _sha256(
        {
            "actor_employee_id": actor_employee_id,
            "route": route,
            "command": "create",
            "payload": {
                "request_type": data.get("request_type"),
                "reference_no": data.get("reference_no"),
                "notes": data.get("notes"),
                "reason_category": data.get("reason_category"),
                "reason_memo": data.get("reason_memo"),
                # StockRequest lines는 요청자가 지정한 순서를 의미하므로 보존한다.
                "lines": [_stock_line(line) for line in data.get("lines", ())],
            },
        }
    )


def require_matching_fingerprint(
    stored_fingerprint: str | None,
    expected_fingerprint: str,
) -> None:
    """legacy null과 다른 의미의 key 재사용을 fail-closed로 거부한다."""
    if stored_fingerprint is None:
        raise IdempotencyConflict("legacy_fingerprint_missing")
    if stored_fingerprint != expected_fingerprint:
        raise IdempotencyConflict("fingerprint_mismatch")
