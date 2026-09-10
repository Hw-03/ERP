"""불량 발생 통계의 KST 기간 계산과 DB 집계."""

from __future__ import annotations

import calendar
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models import (
    DefectQuarantineRecord,
    DefectQuarantineReconstruction,
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    Item,
    ProductSymbol,
    TransactionLog,
    TransactionTypeEnum,
)

from app.schemas.defect_statistics import (
    DefectStatisticsBreakdownEntry,
    DefectStatisticsFilters,
    DefectStatisticsItemBreakdownEntry,
    DefectStatisticsPeriod,
    DefectStatisticsPeriodKind,
    DefectStatisticsResponse,
    DefectStatisticsSummary,
    DefectStatisticsTimelineEntry,
)


KST = ZoneInfo("Asia/Seoul")
UNCLASSIFIED_LABEL = "미분류"
UNCLASSIFIED_FILTER_VALUE = "UNCLASSIFIED"


@dataclass(frozen=True)
class _ResolvedFilters:
    """DB의 제품 모델 기호까지 해석한 순수 발생 필터."""

    departments: frozenset[str]
    model_symbols: frozenset[str] | None
    process_steps: frozenset[str]
    include_unclassified_models: bool
    include_unclassified_process_steps: bool


@dataclass(frozen=True)
class _Occurrence:
    """격리 원장과 direct 작업을 같은 집계 단위로 정규화한 한 건."""

    occurred_at: datetime
    item_id: uuid.UUID
    item_name: str
    mes_code: str | None
    model_symbol: str
    process_type_code: str
    department: str
    reason: str
    quantity: int
    is_disused: bool


@dataclass
class _Totals:
    """한 분류값에 누적되는 발생 건수와 수량."""

    record_count: int = 0
    quantity: int = 0


def calculate_statistics_period(
    period: DefectStatisticsPeriodKind,
    anchor: date,
) -> DefectStatisticsPeriod:
    """앵커가 속한 KST 주·월·연도의 포함 날짜 범위를 반환한다."""

    if period == "week":
        start_date = anchor - timedelta(days=anchor.weekday())
        end_date = start_date + timedelta(days=6)
    elif period == "month":
        start_date = anchor.replace(day=1)
        end_date = anchor.replace(day=calendar.monthrange(anchor.year, anchor.month)[1])
    elif period == "year":
        start_date = date(anchor.year, 1, 1)
        end_date = date(anchor.year, 12, 31)
    else:
        raise ValueError(f"지원하지 않는 통계 기간: {period}")

    return DefectStatisticsPeriod(
        kind=period,
        anchor=anchor,
        start_date=start_date,
        end_date=end_date,
    )


def _kst_period_utc_bounds(period: DefectStatisticsPeriod) -> tuple[datetime, datetime]:
    """KST 포함 날짜 범위를 UTC-naive 반개구간으로 변환한다."""

    start = datetime.combine(period.start_date, time.min, tzinfo=KST)
    end = datetime.combine(period.end_date + timedelta(days=1), time.min, tzinfo=KST)
    return (
        start.astimezone(UTC).replace(tzinfo=None),
        end.astimezone(UTC).replace(tzinfo=None),
    )


def _normalize_values(values: tuple[str, ...], *, upper: bool = False) -> frozenset[str]:
    """공백 값을 버리고 단일·복수 서비스 입력을 중복 없는 집합으로 만든다."""

    normalized = (value.strip() for value in values)
    if upper:
        normalized = (value.upper() for value in normalized)
    return frozenset(value for value in normalized if value)


def _resolve_filters(db: Session, filters: DefectStatisticsFilters) -> _ResolvedFilters:
    """재고 대시보드처럼 모델명을 ProductSymbol 기호로 해석한다.

    기존 재고 필터 계약에 맞춰 요청 모델명과 일치하는 기호가 전혀 없으면
    모델 조건을 적용하지 않는다.
    """

    departments = _normalize_values(filters.departments)
    requested_models = _normalize_values(filters.models)
    include_unclassified_models = any(
        value == UNCLASSIFIED_LABEL
        or value.upper() == UNCLASSIFIED_FILTER_VALUE
        for value in requested_models
    )
    model_names = frozenset(
        value
        for value in requested_models
        if value != UNCLASSIFIED_LABEL
        and value.upper() != UNCLASSIFIED_FILTER_VALUE
    )
    requested_process_steps = _normalize_values(filters.process_steps, upper=True)
    include_unclassified_process_steps = bool(
        {UNCLASSIFIED_LABEL, UNCLASSIFIED_FILTER_VALUE} & requested_process_steps
    )
    process_steps = requested_process_steps - {
        UNCLASSIFIED_LABEL,
        UNCLASSIFIED_FILTER_VALUE,
    }
    model_symbols: frozenset[str] | None = None
    if model_names:
        symbols = db.query(ProductSymbol.symbol).filter(
            ProductSymbol.model_name.in_(model_names),
            ProductSymbol.symbol.isnot(None),
        ).all()
        resolved = frozenset(str(row[0]) for row in symbols if row[0])
        if resolved:
            model_symbols = resolved
    if include_unclassified_models and model_symbols is None:
        model_symbols = frozenset()
    return _ResolvedFilters(
        departments=departments,
        model_symbols=model_symbols,
        process_steps=process_steps,
        include_unclassified_models=include_unclassified_models,
        include_unclassified_process_steps=include_unclassified_process_steps,
    )


def _matches_filters(
    occurrence: _Occurrence,
    filters: _ResolvedFilters,
) -> bool:
    """부서, 모델 기호 포함, 공정 코드 끝 글자 기준으로 발생 한 건을 판정한다."""

    if filters.departments and occurrence.department not in filters.departments:
        return False
    model_symbol = (occurrence.model_symbol or "").strip()
    if filters.model_symbols is not None or filters.include_unclassified_models:
        matches_model = bool(filters.model_symbols) and any(
            symbol in model_symbol for symbol in filters.model_symbols
        )
        matches_unclassified_model = (
            filters.include_unclassified_models and not model_symbol
        )
        if not matches_model and not matches_unclassified_model:
            return False
    process_type_code = (occurrence.process_type_code or "").strip()
    if "DISUSED" in filters.process_steps and not occurrence.is_disused:
        return False
    process_steps = filters.process_steps - {"DISUSED"}
    if process_steps or filters.include_unclassified_process_steps:
        process_step = process_type_code[-1:].upper()
        matches_process = process_step in process_steps
        matches_unclassified_process = (
            filters.include_unclassified_process_steps and not process_type_code
        )
        if not matches_process and not matches_unclassified_process:
            return False
    return True


def _occurrence_from_record(
    record: DefectQuarantineRecord,
    item: Item,
) -> _Occurrence:
    """격리 기록 원본 수량을 수정되지 않는 발생 한 건으로 변환한다."""

    return _Occurrence(
        occurred_at=record.quarantined_at,
        item_id=item.item_id,
        item_name=item.item_name,
        mes_code=item.mes_code,
        model_symbol=item.model_symbol or "",
        process_type_code=item.process_type_code or "",
        department=(record.department or UNCLASSIFIED_LABEL).strip() or UNCLASSIFIED_LABEL,
        reason=(record.reason_category or UNCLASSIFIED_LABEL).strip() or UNCLASSIFIED_LABEL,
        quantity=abs(int(record.original_quantity)),
        is_disused=item.legacy_item_type == "불용",
    )


def _defective_quantity_from_inventory_effect(
    inventory_effect: object,
    department: str,
) -> int | None:
    """원본 거래가 특정 부서 불량 위치에 기록한 수량을 검증한다."""

    if not isinstance(inventory_effect, list):
        return None

    total = 0
    for effect in inventory_effect:
        if not isinstance(effect, dict):
            continue
        if (
            effect.get("scope") != "location"
            or effect.get("department") != department
            or effect.get("status") != "DEFECTIVE"
        ):
            continue
        try:
            total += int(effect.get("delta", 0))
        except (TypeError, ValueError):
            return None
    return total


def _is_verified_reconstructed_legacy_record(
    record: DefectQuarantineRecord,
    source_log: TransactionLog | None,
) -> bool:
    """복원 자식이 원본 불량 거래와 일치할 때만 통계 발생으로 인정한다."""

    if source_log is None or source_log.cancelled:
        return False
    if source_log.transaction_type != TransactionTypeEnum.MARK_DEFECTIVE:
        return False
    if source_log.defect_quarantine_record_id != record.record_id:
        return False
    if source_log.item_id != record.item_id or source_log.department != record.department:
        return False
    if source_log.created_at != record.quarantined_at:
        return False
    return _defective_quantity_from_inventory_effect(
        source_log.inventory_effect,
        record.department,
    ) == abs(int(record.original_quantity))


def _load_quarantine_occurrences(
    db: Session,
    *,
    start_utc: datetime,
    end_utc: datetime,
    filters: _ResolvedFilters,
) -> tuple[list[_Occurrence], int]:
    """기간 내 격리 원장을 읽고 검증 가능한 legacy 발생만 복원한다."""

    reconstructed_parent_ids = {
        parent_id
        for (parent_id,) in db.query(
            DefectQuarantineReconstruction.parent_record_id
        ).all()
    }
    rows = (
        db.query(
            DefectQuarantineRecord,
            Item,
            DefectQuarantineReconstruction,
            TransactionLog,
        )
        .join(Item, Item.item_id == DefectQuarantineRecord.item_id)
        .outerjoin(
            DefectQuarantineReconstruction,
            DefectQuarantineReconstruction.child_record_id
            == DefectQuarantineRecord.record_id,
        )
        .outerjoin(
            TransactionLog,
            TransactionLog.log_id
            == DefectQuarantineReconstruction.source_transaction_log_id,
        )
        .filter(
            DefectQuarantineRecord.quarantined_at >= start_utc,
            DefectQuarantineRecord.quarantined_at < end_utc,
        )
        .order_by(
            DefectQuarantineRecord.quarantined_at,
            DefectQuarantineRecord.record_id,
        )
        .all()
    )
    occurrences: list[_Occurrence] = []
    excluded_legacy_count = 0
    for record, item, reconstruction, source_log in rows:
        if record.record_id in reconstructed_parent_ids:
            continue
        occurrence = _occurrence_from_record(record, item)
        if not _matches_filters(occurrence, filters):
            continue
        if record.is_legacy and not (
            reconstruction is not None
            and _is_verified_reconstructed_legacy_record(record, source_log)
        ):
            excluded_legacy_count += 1
            continue
        occurrences.append(occurrence)
    return occurrences, excluded_legacy_count


def _occurrence_from_direct_log(
    log: TransactionLog,
    operation: InventoryOperation,
    item: Item,
) -> _Occurrence:
    """격리 미경유 폐기·재작업 대표 로그를 불량 발생 한 건으로 변환한다."""

    return _Occurrence(
        occurred_at=operation.effective_at,
        item_id=item.item_id,
        item_name=item.item_name,
        mes_code=item.mes_code,
        model_symbol=item.model_symbol or "",
        process_type_code=item.process_type_code or "",
        department=(log.department or UNCLASSIFIED_LABEL).strip() or UNCLASSIFIED_LABEL,
        reason=(log.reason_category or UNCLASSIFIED_LABEL).strip() or UNCLASSIFIED_LABEL,
        quantity=abs(int(log.quantity_change)),
        is_disused=item.legacy_item_type == "불용",
    )


def _direct_log_dedupe_key(log: TransactionLog) -> tuple[str, ...]:
    """대표 로그의 실제 요청 라인을 식별하되 구형 로그에는 안정적 대체 키를 쓴다."""

    if log.operation_line_id is not None:
        return ("operation_line", str(log.operation_line_id))
    role = log.operation_role.value if log.operation_role is not None else ""
    return (
        "fallback",
        str(log.operation_id or ""),
        role,
        str(log.item_id),
        (log.department or "").strip(),
        str(log.defect_quarantine_record_id or ""),
    )


def _load_direct_occurrences(
    db: Session,
    *,
    start_utc: datetime,
    end_utc: datetime,
    filters: _ResolvedFilters,
) -> list[_Occurrence]:
    """격리 연결이 없는 direct 폐기·재작업의 대표 로그만 읽는다.

    ``operation_id``·``operation_role``·``defect_quarantine_record_id`` 조합으로
    중복을 제거한다. 재작업 자식과 격리 이후 후속 작업은 쿼리 조건에서 제외한다.
    """

    rows = (
        db.query(TransactionLog, InventoryOperation, Item)
        .join(
            InventoryOperation,
            InventoryOperation.operation_id == TransactionLog.operation_id,
        )
        .join(Item, Item.item_id == TransactionLog.item_id)
        .filter(
            InventoryOperation.kind == InventoryOperationKindEnum.BUSINESS,
            InventoryOperation.effective_at >= start_utc,
            InventoryOperation.effective_at < end_utc,
            TransactionLog.defect_quarantine_record_id.is_(None),
            or_(
                and_(
                    InventoryOperation.domain == "stock_request",
                    InventoryOperation.action == "scrap_normal",
                    TransactionLog.transaction_type == TransactionTypeEnum.DEFECT_SCRAP,
                    TransactionLog.operation_role == InventoryOperationRoleEnum.PRIMARY,
                ),
                and_(
                    InventoryOperation.domain.in_(("stock_request", "defect")),
                    InventoryOperation.action == "rework_normal",
                    TransactionLog.transaction_type == TransactionTypeEnum.DISASSEMBLE,
                    TransactionLog.operation_role
                    == InventoryOperationRoleEnum.REWORK_PARENT_NORMAL,
                ),
            ),
        )
        .order_by(
            InventoryOperation.effective_at,
            InventoryOperation.operation_id,
            TransactionLog.log_id,
        )
        .all()
    )
    occurrences: list[_Occurrence] = []
    seen: set[tuple[str, ...]] = set()
    for log, operation, item in rows:
        occurrence = _occurrence_from_direct_log(log, operation, item)
        if not _matches_filters(occurrence, filters):
            continue
        dedupe_key = _direct_log_dedupe_key(log)
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        occurrences.append(occurrence)
    return occurrences


def _sort_breakdowns(
    entries: list[DefectStatisticsBreakdownEntry],
) -> list[DefectStatisticsBreakdownEntry]:
    """수량·건수 내림차순 뒤 라벨·키 오름차순으로 순위를 결정한다."""

    return sorted(
        entries,
        key=lambda entry: (
            -entry.quantity,
            -entry.record_count,
            entry.label,
            entry.key,
        ),
    )


def _build_breakdowns(
    occurrences: list[_Occurrence],
) -> tuple[
    list[DefectStatisticsItemBreakdownEntry],
    list[DefectStatisticsBreakdownEntry],
    list[DefectStatisticsBreakdownEntry],
]:
    """정규화 발생을 품목·사유·부서별 건수와 수량으로 집계한다."""

    item_totals: dict[uuid.UUID, _Totals] = {}
    items_by_id: dict[uuid.UUID, _Occurrence] = {}
    reason_totals: dict[str, _Totals] = {}
    department_totals: dict[str, _Totals] = {}
    for occurrence in occurrences:
        item_total = item_totals.setdefault(occurrence.item_id, _Totals())
        item_total.record_count += 1
        item_total.quantity += occurrence.quantity
        items_by_id.setdefault(occurrence.item_id, occurrence)

        reason_total = reason_totals.setdefault(occurrence.reason, _Totals())
        reason_total.record_count += 1
        reason_total.quantity += occurrence.quantity

        department_total = department_totals.setdefault(occurrence.department, _Totals())
        department_total.record_count += 1
        department_total.quantity += occurrence.quantity

    items = [
        DefectStatisticsItemBreakdownEntry(
            key=str(item_id),
            label=items_by_id[item_id].item_name,
            item_id=item_id,
            mes_code=items_by_id[item_id].mes_code,
            record_count=totals.record_count,
            quantity=totals.quantity,
        )
        for item_id, totals in item_totals.items()
    ]
    reasons = [
        DefectStatisticsBreakdownEntry(
            key=label,
            label=label,
            record_count=totals.record_count,
            quantity=totals.quantity,
        )
        for label, totals in reason_totals.items()
    ]
    departments = [
        DefectStatisticsBreakdownEntry(
            key=label,
            label=label,
            record_count=totals.record_count,
            quantity=totals.quantity,
        )
        for label, totals in department_totals.items()
    ]
    sorted_items = sorted(
        items,
        key=lambda entry: (
            -entry.quantity,
            -entry.record_count,
            entry.label,
            entry.key,
        ),
    )
    return sorted_items, _sort_breakdowns(reasons), _sort_breakdowns(departments)


def _to_kst_date(value: datetime) -> date:
    """DB UTC timestamp를 KST 업무 날짜로 변환한다."""

    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return aware.astimezone(KST).date()


def _build_timeline(
    period: DefectStatisticsPeriod,
    occurrences: list[_Occurrence],
) -> list[DefectStatisticsTimelineEntry]:
    """주·월은 모든 날짜, 연은 12개월을 0값부터 채워 집계한다."""

    if period.kind == "year":
        buckets = [f"{period.anchor.year:04d}-{month:02d}" for month in range(1, 13)]
        labels = {bucket: f"{month}월" for month, bucket in enumerate(buckets, start=1)}
    else:
        day_count = (period.end_date - period.start_date).days + 1
        dates = [period.start_date + timedelta(days=offset) for offset in range(day_count)]
        buckets = [value.isoformat() for value in dates]
        labels = {value.isoformat(): f"{value.month}/{value.day}" for value in dates}
    totals = {bucket: _Totals() for bucket in buckets}
    for occurrence in occurrences:
        occurred_date = _to_kst_date(occurrence.occurred_at)
        bucket = (
            f"{occurred_date.year:04d}-{occurred_date.month:02d}"
            if period.kind == "year"
            else occurred_date.isoformat()
        )
        total = totals.get(bucket)
        if total is None:
            continue
        total.record_count += 1
        total.quantity += occurrence.quantity
    return [
        DefectStatisticsTimelineEntry(
            bucket=bucket,
            label=labels[bucket],
            record_count=totals[bucket].record_count,
            quantity=totals[bucket].quantity,
        )
        for bucket in buckets
    ]


def get_defect_statistics(
    db: Session,
    *,
    period: DefectStatisticsPeriodKind,
    anchor: date,
    filters: DefectStatisticsFilters | None = None,
) -> DefectStatisticsResponse:
    """KST 기간과 다중 필터에 맞는 불량 발생 통계를 반환한다.

    격리 원장은 ``original_quantity``·``quarantined_at``을 정본으로 삼고 legacy는
    제외 건수로 분리한다. 격리 미경유 direct 폐기·재작업만 operation metadata와
    대표 TransactionLog로 추가하여 격리 후속 처리의 이중 집계를 막는다.
    """

    calculated_period = calculate_statistics_period(period, anchor)
    start_utc, end_utc = _kst_period_utc_bounds(calculated_period)
    resolved_filters = _resolve_filters(db, filters or DefectStatisticsFilters())
    quarantine_occurrences, excluded_legacy_count = _load_quarantine_occurrences(
        db,
        start_utc=start_utc,
        end_utc=end_utc,
        filters=resolved_filters,
    )
    direct_occurrences = _load_direct_occurrences(
        db,
        start_utc=start_utc,
        end_utc=end_utc,
        filters=resolved_filters,
    )
    occurrences = quarantine_occurrences + direct_occurrences
    items, reasons, departments = _build_breakdowns(occurrences)
    return DefectStatisticsResponse(
        period=calculated_period,
        summary=DefectStatisticsSummary(
            record_count=len(occurrences),
            quantity=sum(occurrence.quantity for occurrence in occurrences),
            top_item=items[0] if items else None,
            top_reason=reasons[0] if reasons else None,
        ),
        timeline=_build_timeline(calculated_period, occurrences),
        items=items,
        reasons=reasons,
        departments=departments,
        excluded_legacy_count=excluded_legacy_count,
    )
