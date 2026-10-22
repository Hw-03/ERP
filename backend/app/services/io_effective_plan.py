"""실행과 같은 정규화로 계산하는 읽기 전용 작업 효과 snapshot."""
from __future__ import annotations

import hashlib
import json
from typing import Any
import uuid

from sqlalchemy.orm import Session

from app.models import Employee, IoBatch, IoBundle, IoLine, Item, StockRequest, StockRequestStatusEnum, StockRequestTypeEnum
from app.services import io_dispatch
from app.services.io_preview import APPROVAL_SUB_TYPES, INTERNAL_USE_SUB_TYPE, _d, _enum_value, normalize_process_sub_type
from app.services.work_reservation_errors import WorkReservationError


def _clone_batch(batch: IoBatch) -> IoBatch:
    """관계의 컬럼값만 transient 객체로 복제해 ORM 원본과 snapshot을 분리한다."""
    clone = IoBatch(**{column.key: getattr(batch, column.key) for column in IoBatch.__table__.columns})
    for bundle in batch.bundles:
        bundle_clone = IoBundle(**{
            column.key: getattr(bundle, column.key) for column in IoBundle.__table__.columns
        })
        bundle_clone.lines = [IoLine(**{
            column.key: getattr(line, column.key) for column in IoLine.__table__.columns
        }) for line in bundle.lines]
        clone.bundles.append(bundle_clone)
    return clone


def _location(bucket: str, department: str | None) -> dict[str, Any] | None:
    """사용출고의 none 부서 표시값은 물리 목적지로 취급하지 않는다."""
    if bucket == "none":
        return None
    if bucket == "warehouse":
        return {"bucket": bucket, "department": None}
    if bucket in {"production", "defective"} and department and department == department.strip():
        return {"bucket": bucket, "department": _enum_value(department)}
    raise WorkReservationError("VALIDATION_ERROR", "작업 재고 위치가 올바르지 않습니다.", 422)


def _effect(line: IoLine) -> dict[str, Any]:
    """실행 direction을 물리 in/out/move로 표현하고 절삭 전 수량을 검증한다."""
    quantity = _d(line.quantity)
    if not quantity.is_finite() or quantity <= 0 or quantity != quantity.to_integral_value():
        raise WorkReservationError("VALIDATION_ERROR", "작업 효과 수량은 양의 정수여야 합니다.", 422)
    if line.from_bucket == "defective":
        raise WorkReservationError("WORK_UNSUPPORTED_SOURCE", "불량 재고를 출발지로 하는 작업 예약은 지원하지 않습니다.", 422)
    source = _location(line.from_bucket, line.from_department)
    target = _location(line.to_bucket, line.to_department)
    endpoints = (line.from_bucket, line.to_bucket)
    if line.direction == "in" and endpoints in {("none", "warehouse"), ("none", "production")}:
        kind = "in"
    elif line.direction == "out" and endpoints in {("warehouse", "none"), ("production", "none")}:
        kind = "out"
    elif line.direction == "adjust" and endpoints in {("none", "warehouse"), ("none", "production")}:
        kind = "in"
    elif line.direction == "adjust" and endpoints in {("warehouse", "none"), ("production", "none")}:
        kind = "out"
    elif line.direction == "move" and endpoints in {
        ("warehouse", "production"), ("production", "warehouse"), ("production", "production"),
    }:
        kind = "move"
    elif line.direction == "defective" and endpoints in {("warehouse", "defective"), ("production", "defective")}:
        kind = "move"
    else:
        raise WorkReservationError("VALIDATION_ERROR", "작업 효과의 입출고 방향이 올바르지 않습니다.", 422)
    if kind == "move" and source == target:
        raise WorkReservationError("VALIDATION_ERROR", "출발 위치와 도착 위치가 같은 이동은 저장할 수 없습니다.", 422)
    return {
        "effect_id": str(line.line_id),
        "operation_line_id": str(line.line_id),
        "bundle_id": str(line.bundle_id),
        "item_id": str(line.item_id),
        "item_name": line.item_name_snapshot,
        "mes_code": line.mes_code_snapshot,
        "unit": line.unit,
        "quantity": int(quantity),
        "kind": kind,
        "from": source,
        "to": target,
    }


def _approval_group(
    kind: str, request_type: StockRequestTypeEnum, department: str | None,
    lines: list[IoLine], *, reference_only: bool = False,
) -> dict[str, Any]:
    """효과가 없는 참조행까지 결재 요청의 분할·수량·경로를 해시에 보존한다."""
    return {
        "kind": kind,
        "request_type": request_type.value,
        "department": _enum_value(department),
        "lines": [
            {"operation_line_id": str(line.line_id), "quantity": str(_d(line.quantity).normalize()),
             "from": None if reference_only else _location(line.from_bucket, line.from_department),
             "to": None if reference_only else _location(line.to_bucket, line.to_department)}
            for line in sorted(lines, key=lambda line: str(line.line_id))
        ],
    }


def _approval_plan(
    db: Session, batch: IoBatch, *, department_required: bool, custom_bundle_ids: set[uuid.UUID],
) -> list[dict[str, Any]]:
    """실제 dispatcher의 분할 규칙을 읽되 요청 생성과 자가승인은 실행하지 않는다."""
    lines = io_dispatch._included_lines(batch)
    requester = db.get(Employee, batch.requester_employee_id)
    if requester is None:
        raise ValueError("요청자 직원을 찾을 수 없습니다.")
    if department_required:
        references = io_dispatch._custom_process_bom_reference_lines(batch, custom_bundle_ids) if not lines else []
        return [_approval_group(
            "department", StockRequestTypeEnum.MANUAL_ADJUSTMENT,
            io_dispatch.department_approval_department(batch, requester),
            lines or references, reference_only=not lines,
        )]
    if not lines or batch.sub_type not in APPROVAL_SUB_TYPES:
        return []
    if batch.sub_type == INTERNAL_USE_SUB_TYPE:
        groups = io_dispatch.group_internal_use_approval_lines(db, lines)
        if batch.status != "draft":
            groups = _submitted_internal_use_groups(db, batch, lines, groups)
        return [_approval_group(
            kind,
            StockRequestTypeEnum.INTERNAL_USE if all(line.direction == "out" for line in groups[kind])
            else StockRequestTypeEnum.MANUAL_ADJUSTMENT,
            (batch.to_department or requester.department) if kind == "department" else None,
            groups[kind],
        ) for kind in ("warehouse", "as_research", "department") if kind in groups]
    request_type = io_dispatch._stock_request_type(batch.sub_type, from_bucket=lines[0].from_bucket)
    # stock_requests.create_request의 불량 등록은 창고 경로에서도 즉시 처리한다.
    kind = "none" if batch.sub_type == "defect_quarantine" else "warehouse"
    return [_approval_group(kind, request_type, None, lines)]


def _submitted_internal_use_groups(
    db: Session, batch: IoBatch, lines: list[IoLine], live_groups: dict[str, list[IoLine]],
) -> dict[str, list[IoLine]]:
    """제출 후 roster만 바뀌어도 기존 결정은 보존하고 명시적 재분류만 계획에 반영한다."""
    from app.services.internal_use_approval import approval_kind

    requests = db.query(StockRequest).filter_by(operation_batch_id=batch.batch_id).all()
    if not requests:
        return live_groups
    kinds_by_line = {}
    for request in requests:
        if (request.status == StockRequestStatusEnum.CANCELLED and request.cancelled_at is not None
                and batch.submitted_at is not None and request.cancelled_at < batch.submitted_at):
            continue
        for line in request.lines:
            if line.operation_line_id is not None:
                kinds_by_line[line.operation_line_id] = approval_kind(request)
    special_item_ids = {item_id for (item_id,) in db.query(Item.item_id).filter(
        Item.item_id.in_({line.item_id for line in lines}), Item.process_type_code.in_({"AR", "AA"}),
    ).all()}
    live_kinds = {line.line_id: kind for kind, group in live_groups.items() for line in group}
    groups: dict[str, list[IoLine]] = {}
    for line in lines:
        kind = live_kinds[line.line_id]
        existing_kind = kinds_by_line.get(line.line_id)
        if (line.direction == "out" and line.from_bucket == "production" and line.item_id in special_item_ids
                and existing_kind in {"as_research", "department"}):
            kind = existing_kind
        groups.setdefault(kind, []).append(line)
    return groups


def build_effective_plan(db: Session, batch: IoBatch) -> dict[str, Any]:
    """저장 snapshot을 계산한다. 호출자는 내부 사용출고 roster/재고 잠금을 담당한다.

    입력은 저장 경계에서 업무·권한 검증을 마친 배치이며 토큰·경로·포함은 복제본에서만 바꾼다.
    부족량 검증과 메모 필수 검증은 저장/제출의 각 명령 경계에 남긴다.
    """
    with db.no_autoflush:
        clone = _clone_batch(batch)
        clone.sub_type = normalize_process_sub_type(
            work_type=clone.work_type, sub_type=clone.sub_type, bundles=clone.bundles,
        )
        io_dispatch.prepare_effective_lines(db, clone)
        custom_bundle_ids = io_dispatch._custom_process_bom_bundle_ids(db, clone)
        department_required = io_dispatch.requires_department_approval(clone, custom_bundle_ids)
        io_dispatch.finalize_effective_lines(db, clone, custom_bundle_ids)
        effects = sorted((_effect(line) for line in io_dispatch._included_lines(clone)), key=lambda effect: effect["effect_id"])
        approval_plan = _approval_plan(
            db, clone, department_required=department_required, custom_bundle_ids=custom_bundle_ids,
        )
    canonical = {
        "version": 1,
        "work_type": clone.work_type,
        "sub_type": clone.sub_type,
        "effects": [{key: value for key, value in effect.items() if key not in {"item_name", "mes_code"}}
                    for effect in effects],
        "approval_plan": approval_plan,
    }
    fingerprint = hashlib.sha256(json.dumps(
        canonical, ensure_ascii=True, sort_keys=True, separators=(",", ":"),
    ).encode("utf-8")).hexdigest()
    return {"version": 1, "fingerprint": fingerprint, "effects": effects}
