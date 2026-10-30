"""Read management unit costs and maintain explicitly entered standards."""

from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Employee, Item, OperatorSession, SystemSetting
from app.routers._cost_access import can_edit_cost, require_cost_editor
from app.routers._errors import ErrorCode, http_error
from app.routers.operator_sessions import require_operator_session
from app.schemas.cost import (
    CostStandardsResponse, CostStandardsUpdate, ItemCostResponse,
    ItemCostStandardsUpdate, ItemCostSummaryRequest, ItemCostSummary,
    CostPurchaseInfoUpdate, CostPurchaseInfoResponse,
)
from app.services import audit
from app.services.cost import get_item_cost, get_item_cost_summaries


router = APIRouter()
HOURLY_LABOR_RATE_KEY = "cost.standard_hourly_labor_rate"
Operator = Annotated[tuple[Employee, OperatorSession], Depends(require_operator_session)]
SimulationRate = Annotated[Decimal | None, Query(ge=0, max_digits=18, decimal_places=2)]


def _decimal_string(value: Decimal | None) -> str | None:
    """Format monetary and time standards without treating explicit zero as absent."""
    return format(value, ".2f") if value is not None else None


def _hourly_rate(db: Session) -> Decimal | None:
    """An unset standard has no row; reads must never initialize defaults."""
    setting = db.get(SystemSetting, HOURLY_LABOR_RATE_KEY)
    return Decimal(setting.setting_value) if setting is not None else None


def _item(db: Session, item_id: UUID) -> Item:
    """Exclude deleted roots consistently with normal item detail views."""
    item = db.query(Item).filter(Item.item_id == item_id, Item.deleted_at.is_(None)).first()
    if item is None:
        raise http_error(404, ErrorCode.NOT_FOUND, "품목을 찾을 수 없습니다.")
    return item


def _item_response(db: Session, item: Item, employee: Employee, simulation_hourly_rate: Decimal | None = None) -> dict:
    """Read persisted standards and optionally override the rate for this calculation only."""
    rate = simulation_hourly_rate if simulation_hourly_rate is not None else _hourly_rate(db)
    result = get_item_cost(db, item.item_id, rate)
    return {
        "item_id": item.item_id,
        "process_type_code": item.process_type_code,
        "currency": "KRW",
        "basis": "management_standard",
        "can_edit": can_edit_cost(employee),
        "standards": {
            "standard_purchase_price": _decimal_string(item.standard_purchase_price),
            "purchase_price_effective_date": item.purchase_price_effective_date,
            "standard_work_minutes": _decimal_string(item.standard_work_minutes),
            "standard_yield_percent": _decimal_string(item.standard_yield_percent),
            "purchase_currency": item.purchase_currency,
            "foreign_purchase_price": _decimal_string(item.foreign_purchase_price),
            "purchase_exchange_rate": format(item.purchase_exchange_rate, ".6f") if item.purchase_exchange_rate is not None else None,
        },
        "hourly_labor_rate": _decimal_string(rate),
        **result,
    }


@router.get("/standards", response_model=CostStandardsResponse)
def get_standards(operator: Operator, db: Session = Depends(get_db)) -> dict:
    """Return unknown rates as null, including for ordinary authenticated staff."""
    return {"hourly_labor_rate": _decimal_string(_hourly_rate(db)), "can_edit": can_edit_cost(operator[0])}


@router.patch("/standards", response_model=CostStandardsResponse)
def update_standards(payload: CostStandardsUpdate, request: Request, db: Session = Depends(get_db)) -> dict:
    """Omission preserves the rate; explicit null removes the optional setting."""
    employee = require_cost_editor(db, request)
    if "hourly_labor_rate" in payload.model_fields_set and _stage_hourly_rate(db, request, payload.hourly_labor_rate):
        db.commit()
    return {"hourly_labor_rate": _decimal_string(_hourly_rate(db)), "can_edit": can_edit_cost(employee)}


@router.post("/item-summaries", response_model=list[ItemCostSummary])
def get_cost_summaries(payload: ItemCostSummaryRequest, operator: Operator,
                       db: Session = Depends(get_db), simulation_hourly_rate: SimulationRate = None) -> list[dict]:
    """Read a bounded page of costs without returning every root's full tree."""
    rate = simulation_hourly_rate if simulation_hourly_rate is not None else _hourly_rate(db)
    return get_item_cost_summaries(db, payload.item_ids, rate)


@router.get("/items/{item_id}", response_model=ItemCostResponse)
def get_cost(item_id: UUID, operator: Operator, db: Session = Depends(get_db), simulation_hourly_rate: SimulationRate = None) -> dict:
    """Calculate one active item's BOM against current management standards."""
    return _item_response(db, _item(db, item_id), operator[0], simulation_hourly_rate)


def _stage_hourly_rate(db: Session, request: Request, rate: Decimal | None) -> bool:
    """Stage the shared setting and audit without splitting a caller's transaction."""
    if _hourly_rate(db) == rate:
        return False
    setting = db.get(SystemSetting, HOURLY_LABOR_RATE_KEY)
    if rate is None:
        if setting is not None:
            db.delete(setting)
    elif setting is None:
        db.add(SystemSetting(setting_key=HOURLY_LABOR_RATE_KEY, setting_value=_decimal_string(rate)))
    else:
        setting.setting_value = _decimal_string(rate)
    audit.record(db, request=request, action="cost.standards.update", target_type="settings",
                 target_id=HOURLY_LABOR_RATE_KEY, payload_summary="hourly_labor_rate", actor_pin_role="operator")
    return True


def _purchase_info_response(db: Session, item: Item) -> dict:
    """Expose the authorized information form using exact decimal strings."""
    return {
        **{name: getattr(item, name) for name in CostPurchaseInfoUpdate.model_fields if name != "hourly_labor_rate"},
        "item_id": item.item_id, "unit": item.unit, "purchase_currency": item.purchase_currency,
        "process_type_code": item.process_type_code,
        "standard_yield_percent": _decimal_string(item.standard_yield_percent),
        "item_name": item.item_name, "mes_code": item.mes_code,
        "standard_purchase_price": _decimal_string(item.standard_purchase_price),
        "standard_work_minutes": _decimal_string(item.standard_work_minutes),
        "foreign_purchase_price": _decimal_string(item.foreign_purchase_price),
        "purchase_exchange_rate": format(item.purchase_exchange_rate, ".6f") if item.purchase_exchange_rate is not None else None,
        "hourly_labor_rate": _decimal_string(_hourly_rate(db)),
    }


@router.get("/items/{item_id}/purchase-info", response_model=CostPurchaseInfoResponse)
def get_purchase_info(item_id: UUID, request: Request, db: Session = Depends(get_db)) -> dict:
    """The information tab requires a current department/warehouse manager role."""
    require_cost_editor(db, request)
    return _purchase_info_response(db, _item(db, item_id))


@router.patch("/items/{item_id}/purchase-info", response_model=CostPurchaseInfoResponse)
def update_purchase_info(item_id: UUID, payload: CostPurchaseInfoUpdate, request: Request,
                         db: Session = Depends(get_db)) -> dict:
    """Allow only form fields, preserving omitted values and auditing actual edits."""
    require_cost_editor(db, request)
    item = _item(db, item_id)
    # Complete conversion validation before either item or company setting changes.
    values = _normalize_purchase_values(item, payload.model_dump(exclude_unset=True, exclude={"hourly_labor_rate"}))
    changed = []
    for name, value in values.items():
        if getattr(item, name) != value:
            setattr(item, name, value)
            changed.append(name)
    if changed:
        audit.record(db, request=request, action="item.update", target_type="item",
                     target_id=str(item.item_id), payload_summary=", ".join(changed), actor_pin_role="operator")
    rate_changed = "hourly_labor_rate" in payload.model_fields_set and _stage_hourly_rate(db, request, payload.hourly_labor_rate)
    if changed or rate_changed:
        db.commit()
        db.refresh(item)
    return _purchase_info_response(db, item)


def _normalize_purchase_values(item: Item, values: dict[str, Any]) -> dict[str, Any]:
    """Validate stage eligibility and share foreign conversion between editors."""
    if "standard_yield_percent" in values and item.process_type_code not in {"TF", "NF"}:
        raise http_error(422, "INVALID_YIELD_STAGE", "튜브 완료·발생부 완료 품목만 기준 수율을 저장할 수 있습니다.")
    currency_fields = {"purchase_currency", "foreign_purchase_price", "purchase_exchange_rate", "standard_purchase_price"}
    if currency_fields.intersection(values):
        # A legacy KRW-only price edit explicitly replaces the foreign source.
        currency = values.get("purchase_currency", "KRW" if "standard_purchase_price" in values else item.purchase_currency)
        if currency == "KRW":
            if values.get("foreign_purchase_price") is not None or values.get("purchase_exchange_rate") is not None:
                raise http_error(422, ErrorCode.VALIDATION_ERROR, "외화 단가와 환율은 외화 통화를 선택한 경우에 입력합니다.")
            values.update(purchase_currency="KRW", foreign_purchase_price=None, purchase_exchange_rate=None)
        else:
            foreign = values.get("foreign_purchase_price", item.foreign_purchase_price)
            exchange = values.get("purchase_exchange_rate", item.purchase_exchange_rate)
            if foreign is None or exchange is None:
                raise http_error(422, ErrorCode.VALIDATION_ERROR, "외화 단가와 적용 환율을 모두 입력해 주세요.")
            if "standard_purchase_price" in values:
                raise http_error(422, ErrorCode.VALIDATION_ERROR, "외화 단가는 환율로 원화 환산하므로 원화 단가를 함께 입력할 수 없습니다.")
            with localcontext() as context:
                context.prec = 40
                converted = (foreign * exchange).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if converted > Decimal("9999999999999999.99"):
                raise http_error(422, ErrorCode.VALIDATION_ERROR, "원화 환산 단가가 저장 가능한 범위를 초과했습니다.")
            values.update(purchase_currency=currency, foreign_purchase_price=foreign, purchase_exchange_rate=exchange, standard_purchase_price=converted)
    return values


@router.patch("/items/{item_id}/standards", response_model=ItemCostResponse)
def update_item_standards(item_id: UUID, payload: ItemCostStandardsUpdate, request: Request,
                          db: Session = Depends(get_db)) -> dict:
    """Validate the complete patch before staging any standards or audit writes."""
    employee = require_cost_editor(db, request)
    item = _item(db, item_id)
    values = _normalize_purchase_values(item, payload.model_dump(exclude_unset=True))
    changed: list[str] = []
    for field, value in values.items():
        if getattr(item, field) != value:
            setattr(item, field, value)
            changed.append(field)
    if changed:
        audit.record(db, request=request, action="cost.item_standards.update", target_type="item",
                     target_id=str(item.item_id), payload_summary=", ".join(sorted(changed)), actor_pin_role="operator")
        db.commit()
        db.refresh(item)
    return _item_response(db, item, employee)
