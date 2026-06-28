"""Employee master router."""

from datetime import UTC, datetime
import uuid
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, EmployeeAssignedModel, ProductSymbol, StockRequest
from app.routers._errors import ErrorCode, http_error
from app.schemas import (
    EmployeeCreate,
    EmployeePinChangeRequest,
    EmployeePinResetRequest,
    EmployeeResponse,
    EmployeeThemeUpdate,
    EmployeeUpdate,
    PinVerifyRequest,
)
from app.dependencies.admin import require_admin_pin
from app.routers.settings import require_admin
from app.services import rate_limit
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin, validate_pin, verify_pin
from app.services import audit
from app.services._tx import commit_and_refresh, commit_only
from app._actor import set_actor

router = APIRouter()

SIDEBAR_TAB_IDS: tuple[str, ...] = (
    "dashboard",
    "warehouse",
    "shipping",
    "warehouseMap",
    "defect",
    "history",
    "weekly",
    "admin",
)
SIDEBAR_TAB_ID_SET = set(SIDEBAR_TAB_IDS)


def _parse_hidden_sidebar_tabs(raw: Optional[str]) -> List[str]:
    if not raw:
        return []
    tabs: List[str] = []
    for part in raw.split(","):
        tab = part.strip()
        if tab and tab in SIDEBAR_TAB_ID_SET and tab not in tabs:
            tabs.append(tab)
    return tabs


def _validate_hidden_sidebar_tabs(tabs: Optional[List[str]]) -> List[str]:
    if not tabs:
        return []
    normalized: List[str] = []
    invalid: List[str] = []
    for value in tabs:
        tab = str(value).strip()
        if tab not in SIDEBAR_TAB_ID_SET:
            invalid.append(tab)
            continue
        if tab not in normalized:
            normalized.append(tab)
    if invalid:
        raise http_error(
            422,
            ErrorCode.UNPROCESSABLE,
            "알 수 없는 사이드바 탭 권한 값입니다.",
        )
    if len(normalized) == len(SIDEBAR_TAB_IDS):
        raise http_error(
            422,
            ErrorCode.UNPROCESSABLE,
            "직원에게 최소 1개 이상의 탭이 표시되어야 합니다.",
        )
    return normalized


def _serialize_hidden_sidebar_tabs(tabs: List[str]) -> str:
    return ",".join(tabs)


def _is_active_value(value: object) -> bool:
    if isinstance(value, str):
        return value.lower() == "true"
    return bool(value)


def _ensure_admin_tab_access_remains(
    db: Session,
    *,
    employee_id: Optional[uuid.UUID],
    hidden_sidebar_tabs: List[str],
    is_active: bool,
) -> None:
    if is_active and "admin" not in hidden_sidebar_tabs:
        return

    for other in db.query(Employee).all():
        if employee_id is not None and other.employee_id == employee_id:
            continue
        if not _is_active_value(other.is_active):
            continue
        other_hidden = _parse_hidden_sidebar_tabs(
            getattr(other, "hidden_sidebar_tabs", "")
        )
        if "admin" not in other_hidden:
            return

    raise http_error(
        422,
        ErrorCode.UNPROCESSABLE,
        "관리자 탭에 접근 가능한 활성 직원이 최소 1명 필요합니다.",
    )

def _assigned_slots_for(db: Session, employee_id: uuid.UUID) -> List[int]:
    """단일 직원의 담당 모델 slot 목록 (priority asc)."""
    rows = (
        db.query(EmployeeAssignedModel.slot)
        .filter(EmployeeAssignedModel.employee_id == employee_id)
        .order_by(EmployeeAssignedModel.priority.asc(), EmployeeAssignedModel.slot.asc())
        .all()
    )
    return [row.slot for row in rows]


def _assigned_slots_bulk(db: Session, employee_ids: List[uuid.UUID]) -> dict:
    """다수 직원의 담당 모델 slot을 dict[employee_id] = [slot, ...] 형태로 일괄 조회 (N+1 회피)."""
    if not employee_ids:
        return {}
    rows = (
        db.query(EmployeeAssignedModel)
        .filter(EmployeeAssignedModel.employee_id.in_(employee_ids))
        .order_by(EmployeeAssignedModel.employee_id, EmployeeAssignedModel.priority.asc())
        .all()
    )
    grouped: dict = {}
    for row in rows:
        grouped.setdefault(row.employee_id, []).append(row.slot)
    return grouped


def _sync_assigned_models(
    db: Session, employee_id: uuid.UUID, slots: List[int]
) -> None:
    """직원의 담당 모델을 payload 순서(=priority)로 통째 교체.

    - 존재하지 않는 slot, 중복 slot 은 무시한다 (조용히 dedupe).
    - 빈 리스트면 매핑 전부 제거.
    """
    db.query(EmployeeAssignedModel).filter(
        EmployeeAssignedModel.employee_id == employee_id
    ).delete(synchronize_session=False)

    if not slots:
        return

    seen: set = set()
    unique_ordered: list = []
    for s in slots:
        if s in seen:
            continue
        seen.add(s)
        unique_ordered.append(s)

    valid_slots = {
        row.slot
        for row in db.query(ProductSymbol.slot)
        .filter(ProductSymbol.slot.in_(unique_ordered))
        .all()
    }
    for idx, slot in enumerate(unique_ordered):
        if slot not in valid_slots:
            continue
        db.add(
            EmployeeAssignedModel(
                employee_id=employee_id, slot=slot, priority=idx
            )
        )


@router.get("", response_model=List[EmployeeResponse])
def list_employees(
    department: Optional[str] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    query = db.query(Employee)
    if department:
        query = query.filter(Employee.department == department)
    if active_only:
        query = query.filter(Employee.is_active == "true")

    employees = query.order_by(Employee.display_order.asc(), Employee.name.asc()).all()
    slot_map = _assigned_slots_bulk(db, [e.employee_id for e in employees])
    return [
        _to_response(employee, slot_map.get(employee.employee_id, []))
        for employee in employees
    ]


def _auto_employee_code(db: Session) -> str:
    """기존 E{숫자} 패턴에서 최대값 + 1 자동 부여."""
    import re
    codes = [e.employee_code for e in db.query(Employee.employee_code).all()]
    nums = [int(m.group(1)) for c in codes if c and (m := re.fullmatch(r"E(\d+)", c))]
    return f"E{max(nums, default=0) + 1}"


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    request: Request,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    code = payload.employee_code.strip() if payload.employee_code else _auto_employee_code(db)
    existing = db.query(Employee).filter(Employee.employee_code == code).first()
    if existing:
        raise http_error(409, ErrorCode.CONFLICT, "직원 코드가 이미 존재합니다.")

    role_value = (payload.warehouse_role or "none").lower()
    if role_value not in ("none", "primary", "deputy"):
        raise http_error(
            422,
            ErrorCode.UNPROCESSABLE,
            "warehouse_role 은 none/primary/deputy 중 하나여야 합니다.",
        )

    dept_role_value = (payload.department_role or "none").lower()
    if dept_role_value not in ("none", "primary", "deputy"):
        raise http_error(
            422,
            ErrorCode.UNPROCESSABLE,
            "department_role 은 none/primary/deputy 중 하나여야 합니다.",
        )

    hidden_tabs = _validate_hidden_sidebar_tabs(payload.hidden_sidebar_tabs)
    _ensure_admin_tab_access_remains(
        db,
        employee_id=None,
        hidden_sidebar_tabs=hidden_tabs,
        is_active=bool(payload.is_active),
    )
    employee = Employee(
        employee_code=code,
        name=payload.name,
        role=payload.role,
        phone=payload.phone,
        department=payload.department,
        level=payload.level,
        warehouse_role=role_value,
        department_role=dept_role_value,
        io_enabled=payload.io_enabled if payload.io_enabled is not None else True,
        hidden_sidebar_tabs=_serialize_hidden_sidebar_tabs(hidden_tabs),
        display_order=payload.display_order,
        is_active="true" if payload.is_active else "false",
    )
    db.add(employee)
    db.flush()

    if payload.assigned_model_slots is not None:
        _sync_assigned_models(db, employee.employee_id, payload.assigned_model_slots)

    audit.record(
        db,
        request=request,
        action="employee.create",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} ({employee.employee_code})",
    )

    commit_and_refresh(db, employee)
    return _to_response(employee, _assigned_slots_for(db, employee.employee_id))


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: uuid.UUID,
    payload: EmployeeUpdate,
    request: Request,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    candidate_hidden_tabs = _parse_hidden_sidebar_tabs(
        getattr(employee, "hidden_sidebar_tabs", "")
    )
    if payload.hidden_sidebar_tabs is not None:
        candidate_hidden_tabs = _validate_hidden_sidebar_tabs(
            payload.hidden_sidebar_tabs
        )
    candidate_is_active = (
        bool(payload.is_active)
        if payload.is_active is not None
        else _is_active_value(employee.is_active)
    )
    _ensure_admin_tab_access_remains(
        db,
        employee_id=employee.employee_id,
        hidden_sidebar_tabs=candidate_hidden_tabs,
        is_active=candidate_is_active,
    )
    changed: list[str] = []
    if payload.name is not None and employee.name != payload.name:
        employee.name = payload.name; changed.append("name")
    if payload.role is not None and employee.role != payload.role:
        employee.role = payload.role; changed.append("role")
    if payload.phone is not None and employee.phone != payload.phone:
        employee.phone = payload.phone; changed.append("phone")
    if payload.department is not None and employee.department != payload.department:
        employee.department = payload.department; changed.append("department")
    if payload.level is not None and employee.level != payload.level:
        employee.level = payload.level; changed.append("level")
    if payload.warehouse_role is not None:
        new_role = payload.warehouse_role.lower()
        if new_role not in ("none", "primary", "deputy"):
            raise http_error(
                422,
                ErrorCode.UNPROCESSABLE,
                "warehouse_role 은 none/primary/deputy 중 하나여야 합니다.",
            )
        if (employee.warehouse_role or "none") != new_role:
            employee.warehouse_role = new_role
            changed.append("warehouse_role")
    if payload.department_role is not None:
        new_dept_role = payload.department_role.lower()
        if new_dept_role not in ("none", "primary", "deputy"):
            raise http_error(
                422,
                ErrorCode.UNPROCESSABLE,
                "department_role 은 none/primary/deputy 중 하나여야 합니다.",
            )
        if (employee.department_role or "none") != new_dept_role:
            employee.department_role = new_dept_role
            changed.append("department_role")
    if payload.display_order is not None and employee.display_order != payload.display_order:
        employee.display_order = payload.display_order; changed.append("display_order")
    if payload.is_active is not None:
        if employee.is_active != payload.is_active:
            employee.is_active = payload.is_active; changed.append("is_active")
    if payload.io_enabled is not None:
        if bool(employee.io_enabled) != bool(payload.io_enabled):
            employee.io_enabled = bool(payload.io_enabled)
            changed.append("io_enabled")
    if payload.hidden_sidebar_tabs is not None:
        hidden_raw = _serialize_hidden_sidebar_tabs(candidate_hidden_tabs)
        if (getattr(employee, "hidden_sidebar_tabs", "") or "") != hidden_raw:
            employee.hidden_sidebar_tabs = hidden_raw
            changed.append("hidden_sidebar_tabs")
    if payload.assigned_model_slots is not None:
        current = _assigned_slots_for(db, employee.employee_id)
        if current != payload.assigned_model_slots:
            _sync_assigned_models(
                db, employee.employee_id, payload.assigned_model_slots
            )
            changed.append("assigned_models")

    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)

    if changed:
        audit.record(
            db,
            request=request,
            action="employee.update",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary=f"{employee.name}: {', '.join(changed)}",
        )

    commit_and_refresh(db, employee)
    return _to_response(employee, _assigned_slots_for(db, employee.employee_id))


@router.delete("/{employee_id}")
def delete_employee(
    employee_id: uuid.UUID,
    request: Request,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    has_requests = db.query(StockRequest).filter(
        StockRequest.requester_employee_id == employee_id
    ).first() is not None

    if has_requests:
        employee.is_active = False
        employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
        audit.record(
            db,
            request=request,
            action="employee.deactivate",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary=f"{employee.name} ({employee.employee_code}) — 이력 있어 비활성화",
        )
        commit_only(db)
        return JSONResponse(status_code=200, content={"result": "deactivated"})
    else:
        audit.record(
            db,
            request=request,
            action="employee.delete",
            target_type="employee",
            target_id=str(employee.employee_id),
            payload_summary=f"{employee.name} ({employee.employee_code}) — 영구 삭제",
        )
        db.delete(employee)
        commit_only(db)
        return JSONResponse(status_code=200, content={"result": "deleted"})


@router.post("/{employee_id}/verify-pin", response_model=EmployeeResponse)
def verify_employee_pin(
    employee_id: uuid.UUID,
    payload: PinVerifyRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """작업자 식별용 PIN 검증 — 실제 보안 인증이 아님.

    무차별 대입 완화를 위해 (직원ID + 클라이언트 IP) 키로 실패 시도를 제한한다.
    실패만 카운트하며 성공 시 키를 리셋한다.
    """
    client_ip = getattr(getattr(request, "client", None), "host", None) or "unknown"
    rl_key = f"verify_pin:{employee_id}:{client_ip}"

    if rate_limit.is_blocked(rl_key):
        raise http_error(
            429,
            ErrorCode.TOO_MANY_REQUESTS,
            "PIN 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.",
        )

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not bool(employee.is_active):
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    if not verify_pin(employee.pin_hash, payload.pin):
        rate_limit.record_failure(rl_key)
        raise http_error(403, ErrorCode.FORBIDDEN, "PIN이 올바르지 않습니다.")

    rate_limit.record_success(rl_key)
    set_actor(request, employee)
    return _to_response(employee, _assigned_slots_for(db, employee.employee_id))


@router.post("/{employee_id}/change-pin", status_code=status.HTTP_204_NO_CONTENT)
def change_employee_pin(
    employee_id: uuid.UUID,
    payload: EmployeePinChangeRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    """본인 PIN 변경 — 현재 PIN 검증 필요."""
    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")
    if not employee.is_active:
        raise http_error(403, ErrorCode.FORBIDDEN, "비활성 직원입니다.")
    if not verify_pin(employee.pin_hash, payload.current_pin):
        raise http_error(403, ErrorCode.FORBIDDEN, "현재 PIN이 올바르지 않습니다.")
    validate_pin(payload.new_pin)
    if payload.current_pin == payload.new_pin:
        raise http_error(422, ErrorCode.UNPROCESSABLE, "새 PIN은 현재 PIN과 달라야 합니다.")

    set_actor(request, employee)
    employee.pin_hash = hash_pin(payload.new_pin)
    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
    employee.pin_last_changed = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="employee.change_pin",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} PIN 변경",
    )
    commit_only(db)


@router.post("/{employee_id}/reset-pin", status_code=status.HTTP_204_NO_CONTENT)
def reset_employee_pin(
    employee_id: uuid.UUID,
    payload: EmployeePinResetRequest,
    request: Request,
    _admin: Annotated[None, Depends(require_admin_pin)],
    db: Session = Depends(get_db),
):
    """직원 PIN을 기본값(0000)으로 초기화 — 관리자 PIN 검증 필요."""

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    employee.pin_hash = DEFAULT_PIN_HASH
    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
    employee.pin_last_changed = datetime.now(UTC).replace(tzinfo=None)

    audit.record(
        db,
        request=request,
        action="employee.reset_pin",
        target_type="employee",
        target_id=str(employee.employee_id),
        payload_summary=f"{employee.name} PIN 초기화",
    )
    commit_only(db)


@router.put("/{employee_id}/theme", response_model=EmployeeResponse, status_code=status.HTTP_200_OK)
def update_employee_theme(
    employee_id: uuid.UUID,
    payload: EmployeeThemeUpdate,
    db: Session = Depends(get_db),
):
    """직원 테마 설정 저장 (light | dark | null)."""
    if payload.theme and payload.theme not in ("light", "dark"):
        raise http_error(422, ErrorCode.UNPROCESSABLE, "테마는 light, dark, 또는 null이어야 합니다.")

    employee = db.query(Employee).filter(Employee.employee_id == employee_id).first()
    if not employee:
        raise http_error(404, ErrorCode.NOT_FOUND, "직원을 찾을 수 없습니다.")

    employee.theme = payload.theme
    employee.updated_at = datetime.now(UTC).replace(tzinfo=None)
    commit_only(db)
    return _to_response(employee, _assigned_slots_for(db, employee.employee_id))


def _to_response(
    employee: Employee, assigned_model_slots: Optional[List[int]] = None
) -> EmployeeResponse:
    pin_hash = getattr(employee, "pin_hash", None)
    pin_is_default = pin_hash is None or pin_hash == DEFAULT_PIN_HASH
    return EmployeeResponse(
        employee_id=employee.employee_id,
        employee_code=employee.employee_code,
        name=employee.name,
        role=employee.role,
        phone=employee.phone,
        department=employee.department,
        level=employee.level,
        warehouse_role=(employee.warehouse_role or "none"),
        department_role=(employee.department_role or "none"),
        display_order=int(employee.display_order),
        is_active=bool(employee.is_active),
        io_enabled=bool(getattr(employee, "io_enabled", True)),
        created_at=employee.created_at,
        updated_at=employee.updated_at,
        pin_last_changed=getattr(employee, "pin_last_changed", None),
        pin_is_default=pin_is_default,
        theme=getattr(employee, "theme", None),
        assigned_model_slots=assigned_model_slots or [],
        hidden_sidebar_tabs=_parse_hidden_sidebar_tabs(
            getattr(employee, "hidden_sidebar_tabs", "")
        ),
    )
