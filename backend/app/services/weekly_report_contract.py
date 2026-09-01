"""검증된 주간보고의 정상재고 효과 분류 계약."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    InventoryOperation,
    InventoryOperationKindEnum,
    InventoryOperationRoleEnum,
    Item,
    LocationStatusEnum,
    ProductSymbol,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
    WeeklyInventorySnapshot,
)
from app.schemas import (
    WeeklyActivityEvidence,
    WeeklyGroupReport,
    WeeklyItemReport,
    WeeklyProductionModelRow,
    WeeklyReportResponse,
    WeeklyReportSummary,
    WeeklyReportValidation,
    WeeklyValidationFailure,
    WeeklyWarning,
)
from app.services.weekly_inventory_snapshot import load_dashboard_finished_stock


KST = ZoneInfo("Asia/Seoul")
WEEKLY_V2_SETTING_KEY = "weekly_report_v2_starts_at"
TRANSITION_NOTICE = (
    "주간보고 계산 기준을 개선 중입니다. 이번 주 수치는 실제 재고와 다를 수 있으며, "
    "다음 주부터 새 기준으로 정확한 정보가 표시됩니다."
)
FINISHED_CODES = ("TF", "HF", "VF", "NF", "AF", "PF")
DEPARTMENT_NAMES = {
    "TF": "튜브",
    "HF": "고압",
    "VF": "진공",
    "NF": "튜닝",
    "AF": "조립",
    "PF": "출하",
}
PROCESS_LABELS = {
    "TF": "튜브 완료품",
    "HF": "고압 완료품",
    "VF": "진공 완료품",
    "NF": "튜닝 완료품",
    "AF": "조립 완료품",
    "PF": "출하 완료품",
}


class WeeklyActivityClassificationError(ValueError):
    """정상재고 효과가 새 7열 중 어느 곳에도 정확히 대응하지 않을 때 발생한다."""


@dataclass(frozen=True)
class WeeklyInventoryActivity:
    """한 거래 로그가 주간 활동 열과 정상재고에 미치는 효과."""

    produce_qty: Decimal = Decimal("0")
    receive_qty: Decimal = Decimal("0")
    out_qty: Decimal = Decimal("0")
    defect_qty: Decimal = Decimal("0")
    normal_delta: Decimal = Decimal("0")

    def as_tuple(self) -> tuple[Decimal, Decimal, Decimal, Decimal]:
        """표시 열 순서로 비음수 활동량을 반환한다."""
        return (
            self.produce_qty,
            self.receive_qty,
            self.out_qty,
            self.defect_qty,
        )


def _role_value(role: object) -> str:
    return str(getattr(role, "value", role) or "")


def _normal_delta(inventory_effect: object) -> Decimal:
    if not isinstance(inventory_effect, list):
        raise WeeklyActivityClassificationError("재고 효과 기록 형식이 올바르지 않습니다.")
    total = Decimal("0")
    for effect in inventory_effect:
        if not isinstance(effect, dict):
            raise WeeklyActivityClassificationError("재고 효과 기록 형식이 올바르지 않습니다.")
        try:
            delta = Decimal(str(effect["delta"]))
        except (KeyError, TypeError, ValueError) as exc:
            raise WeeklyActivityClassificationError("재고 효과 기록 형식이 올바르지 않습니다.") from exc
        scope = effect.get("scope")
        if scope == "warehouse":
            total += delta
        elif scope == "location" and effect.get("status") == LocationStatusEnum.PRODUCTION.value:
            total += delta
        elif scope in {
            "warehouse_box",
            "warehouse_zone",
            "warehouse_unplaced",
            "location",
        }:
            continue
        else:
            raise WeeklyActivityClassificationError("지원하지 않는 재고 효과가 포함되어 있습니다.")
    return total


def classify_inventory_activity(log: object) -> WeeklyInventoryActivity:
    """거래 역할과 실제 위치 효과를 새 주간 활동 열 한 가지 의미로 분류한다."""
    normal_delta = _normal_delta(getattr(log, "inventory_effect", None))
    tx_type = TransactionTypeEnum(getattr(log, "transaction_type"))
    role = _role_value(getattr(log, "operation_role", None))
    quantity = abs(Decimal(str(getattr(log, "quantity_change", 0) or 0)))

    if role in {
        InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE.value,
        InventoryOperationRoleEnum.REWORK_CHILD_SCRAP.value,
    }:
        if normal_delta != 0:
            raise WeeklyActivityClassificationError("불량·폐기 재작업 자식의 정상재고 효과가 0이 아닙니다.")
        return WeeklyInventoryActivity(
            receive_qty=quantity,
            defect_qty=quantity,
            normal_delta=normal_delta,
        )

    if role == InventoryOperationRoleEnum.REWORK_PARENT_DEFECTIVE.value:
        if normal_delta != 0:
            raise WeeklyActivityClassificationError("기존 불량 재작업 부모가 정상재고를 변경했습니다.")
        return WeeklyInventoryActivity(normal_delta=normal_delta)

    if role == InventoryOperationRoleEnum.REWORK_PARENT_NORMAL.value:
        if normal_delta >= 0:
            raise WeeklyActivityClassificationError("정상 재작업 부모의 정상재고 감소를 확인할 수 없습니다.")
        return WeeklyInventoryActivity(defect_qty=-normal_delta, normal_delta=normal_delta)

    if tx_type == TransactionTypeEnum.PRODUCE and normal_delta > 0:
        return WeeklyInventoryActivity(produce_qty=normal_delta, normal_delta=normal_delta)

    if role == InventoryOperationRoleEnum.REWORK_CHILD_NORMAL.value or tx_type in {
        TransactionTypeEnum.RECEIVE,
        TransactionTypeEnum.UNMARK_DEFECTIVE,
    }:
        if normal_delta > 0:
            return WeeklyInventoryActivity(receive_qty=normal_delta, normal_delta=normal_delta)

    if tx_type == TransactionTypeEnum.ADJUST:
        if normal_delta > 0:
            return WeeklyInventoryActivity(receive_qty=normal_delta, normal_delta=normal_delta)
        if normal_delta < 0:
            return WeeklyInventoryActivity(out_qty=-normal_delta, normal_delta=normal_delta)

    if tx_type == TransactionTypeEnum.MARK_DEFECTIVE and normal_delta < 0:
        return WeeklyInventoryActivity(defect_qty=-normal_delta, normal_delta=normal_delta)

    if tx_type == TransactionTypeEnum.DEFECT_SCRAP:
        if normal_delta < 0:
            return WeeklyInventoryActivity(defect_qty=-normal_delta, normal_delta=normal_delta)
        if normal_delta == 0:
            return WeeklyInventoryActivity(normal_delta=normal_delta)

    if tx_type in {
        TransactionTypeEnum.SHIP,
        TransactionTypeEnum.BACKFLUSH,
        TransactionTypeEnum.INTERNAL_USE,
        TransactionTypeEnum.SUPPLIER_RETURN,
    } and normal_delta < 0:
        return WeeklyInventoryActivity(out_qty=-normal_delta, normal_delta=normal_delta)

    if normal_delta == 0:
        return WeeklyInventoryActivity(normal_delta=normal_delta)
    raise WeeklyActivityClassificationError(
        f"분류되지 않은 정상재고 효과입니다: {tx_type.value} {normal_delta:+}"
    )


@dataclass(frozen=True)
class WeeklyContractState:
    """선택 주차가 레거시·전환·검증 기준 중 어디에 속하는지 나타낸다."""

    report_status: str
    activation_at: Optional[datetime]
    transition_notice: Optional[str] = None


@dataclass(frozen=True)
class _BoundaryItem:
    item_id: object
    mes_code: Optional[str]
    item_name: str
    process_type_code: str
    previous: Decimal
    current: Decimal


@dataclass
class _ActivityTotal:
    produce: Decimal = Decimal("0")
    receive: Decimal = Decimal("0")
    out: Decimal = Decimal("0")
    defect: Decimal = Decimal("0")
    evidence: list[WeeklyActivityEvidence] = field(default_factory=list)
    operation_ids: set[str] = field(default_factory=set)
    log_ids: set[str] = field(default_factory=set)

    @property
    def delta(self) -> Decimal:
        return self.produce + self.receive - self.out - self.defect


def _setting_datetime(db: Session) -> Optional[datetime]:
    setting = db.get(SystemSetting, WEEKLY_V2_SETTING_KEY)
    if setting is None:
        return None
    try:
        parsed = datetime.fromisoformat(setting.setting_value)
    except (TypeError, ValueError) as exc:
        raise ValueError("주간보고 새 기준 활성화 시각이 올바르지 않습니다.") from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=KST)
    return parsed.astimezone(KST)


def weekly_contract_state(
    db: Session,
    *,
    week_start: date,
    week_end: date,
    today: date,
) -> WeeklyContractState:
    """설정된 KST 월요일부터만 검증된 새 기준을 공개한다."""
    activation = _setting_datetime(db)
    if activation is None:
        return WeeklyContractState(report_status="legacy", activation_at=None)
    activation_date = activation.date()
    if week_start >= activation_date:
        return WeeklyContractState(report_status="verified", activation_at=activation)
    if week_start <= today <= week_end and today < activation_date:
        return WeeklyContractState(
            report_status="transition",
            activation_at=activation,
            transition_notice=TRANSITION_NOTICE,
        )
    return WeeklyContractState(report_status="legacy", activation_at=activation)


def _snapshot_normal_items(snapshot: WeeklyInventorySnapshot) -> dict[str, tuple]:
    if int(snapshot.basis_version or 1) < 2:
        raise ValueError("정상·불량이 분리된 주간 재고 기준선이 아닙니다.")
    rows: dict[str, tuple] = {}
    for line in snapshot.items:
        if line.normal_quantity is None or line.defective_quantity is None:
            raise ValueError("주간 재고 기준선의 정상·불량 수량이 누락되었습니다.")
        rows[str(line.item_id)] = (
            line.item_id,
            line.mes_code,
            line.item_name,
            line.process_type_code,
            Decimal(str(line.normal_quantity)),
        )
    return rows


def _live_normal_items(db: Session) -> dict[str, tuple]:
    return {
        str(row.item.item_id): (
            row.item.item_id,
            row.item.mes_code,
            row.item.item_name,
            row.item.process_type_code,
            Decimal(str(row.normal_quantity)),
        )
        for row in load_dashboard_finished_stock(db)
    }


def _load_boundaries(
    db: Session,
    *,
    week_start: date,
    week_end: date,
    today: date,
) -> list[_BoundaryItem]:
    previous_snapshot = (
        db.query(WeeklyInventorySnapshot)
        .filter(WeeklyInventorySnapshot.week_end == week_start - timedelta(days=1))
        .one_or_none()
    )
    if previous_snapshot is None:
        raise ValueError("전주 정상재고 기준선이 없습니다.")
    previous = _snapshot_normal_items(previous_snapshot)

    if week_start <= today <= week_end:
        current = _live_normal_items(db)
    elif week_end < today:
        current_snapshot = (
            db.query(WeeklyInventorySnapshot)
            .filter(WeeklyInventorySnapshot.week_end == week_end)
            .one_or_none()
        )
        if current_snapshot is None:
            raise ValueError("현재 주 정상재고 기준선이 없습니다.")
        current = _snapshot_normal_items(current_snapshot)
    else:
        raise ValueError("아직 시작하지 않은 주차는 검산할 수 없습니다.")

    items: list[_BoundaryItem] = []
    for item_id in sorted(set(previous) | set(current)):
        previous_row = previous.get(item_id)
        current_row = current.get(item_id)
        metadata = current_row or previous_row
        if metadata is None or metadata[3] not in FINISHED_CODES:
            continue
        items.append(
            _BoundaryItem(
                item_id=metadata[0],
                mes_code=metadata[1],
                item_name=metadata[2],
                process_type_code=metadata[3],
                previous=previous_row[4] if previous_row else Decimal("0"),
                current=current_row[4] if current_row else Decimal("0"),
            )
        )
    return items


def _kst_start_utc(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=KST).astimezone(UTC).replace(tzinfo=None)


def _problem_id(week_start: date, item_id: Optional[str], reason: str) -> str:
    payload = f"{week_start.isoformat()}:{item_id or 'report'}:{reason}"
    return "WEEKLY-" + hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16].upper()


def _failure(
    *,
    week_start: date,
    reason: str,
    item: Optional[_BoundaryItem] = None,
    inventory_delta: Decimal = Decimal("0"),
    activity_delta: Decimal = Decimal("0"),
    operation_ids: set[str] | None = None,
    log_ids: set[str] | None = None,
) -> WeeklyValidationFailure:
    item_id = str(item.item_id) if item is not None else None
    return WeeklyValidationFailure(
        problem_id=_problem_id(week_start, item_id, reason),
        item_id=item_id,
        mes_code=item.mes_code if item is not None else None,
        reason=reason,
        inventory_delta=inventory_delta,
        activity_delta=activity_delta,
        operation_ids=sorted(operation_ids or set()),
        log_ids=sorted(log_ids or set()),
    )


def _activity_evidence(
    *,
    operation: InventoryOperation,
    log: TransactionLog,
    activity: WeeklyInventoryActivity,
) -> list[WeeklyActivityEvidence]:
    evidence: list[WeeklyActivityEvidence] = []
    for column, quantity in (
        ("produce", activity.produce_qty),
        ("receive", activity.receive_qty),
        ("out", activity.out_qty),
        ("defect", activity.defect_qty),
    ):
        if quantity <= 0:
            continue
        evidence.append(
            WeeklyActivityEvidence(
                column=column,
                operation_id=str(operation.operation_id),
                log_id=str(log.log_id),
                quantity=quantity,
                label=operation.display_label,
            )
        )
    return evidence


def _collect_activities(
    db: Session,
    *,
    week_start: date,
    week_end: date,
    items: list[_BoundaryItem],
) -> tuple[dict[str, _ActivityTotal], list[WeeklyValidationFailure]]:
    totals = {str(item.item_id): _ActivityTotal() for item in items}
    failures: list[WeeklyValidationFailure] = []
    item_by_id = {str(item.item_id): item for item in items}
    item_ids = [item.item_id for item in items]
    if not item_ids:
        return totals, failures
    start = _kst_start_utc(week_start)
    end = _kst_start_utc(week_end + timedelta(days=1))
    operations = (
        db.query(InventoryOperation)
        .filter(
            InventoryOperation.effective_at >= start,
            InventoryOperation.effective_at < end,
        )
        .all()
    )
    operation_by_id = {str(operation.operation_id): operation for operation in operations}
    excluded: set[str] = set()
    for operation in operations:
        if operation.kind != InventoryOperationKindEnum.CANCELLATION:
            continue
        original_id = str(operation.reverses_operation_id or "")
        if original_id in operation_by_id:
            excluded.update({str(operation.operation_id), original_id})
        else:
            failures.append(
                _failure(
                    week_start=week_start,
                    reason="주차 밖 원 작업을 역전한 취소 작업이 포함되어 있습니다.",
                    operation_ids={str(operation.operation_id), original_id},
                )
            )

    logs = (
        db.query(TransactionLog)
        .filter(
            TransactionLog.item_id.in_(item_ids),
            TransactionLog.created_at >= start,
            TransactionLog.created_at < end,
        )
        .order_by(TransactionLog.created_at, TransactionLog.log_id)
        .all()
    )
    for log in logs:
        item_id = str(log.item_id)
        operation_id = str(log.operation_id or "")
        if not operation_id:
            failures.append(
                _failure(
                    week_start=week_start,
                    item=item_by_id[item_id],
                    reason="공통 작업 원장에 연결되지 않은 정상재고 효과가 있습니다.",
                    log_ids={str(log.log_id)},
                )
            )
            continue
        if operation_id in excluded:
            continue
        operation = operation_by_id.get(operation_id)
        if operation is None or operation.kind != InventoryOperationKindEnum.BUSINESS:
            failures.append(
                _failure(
                    week_start=week_start,
                    item=item_by_id[item_id],
                    reason="선택 주차의 유효 원 작업을 찾을 수 없습니다.",
                    operation_ids={operation_id},
                    log_ids={str(log.log_id)},
                )
            )
            continue
        try:
            activity = classify_inventory_activity(log)
        except WeeklyActivityClassificationError as exc:
            failures.append(
                _failure(
                    week_start=week_start,
                    item=item_by_id[item_id],
                    reason=str(exc),
                    operation_ids={operation_id},
                    log_ids={str(log.log_id)},
                )
            )
            continue
        total = totals[item_id]
        total.produce += activity.produce_qty
        total.receive += activity.receive_qty
        total.out += activity.out_qty
        total.defect += activity.defect_qty
        total.evidence.extend(_activity_evidence(operation=operation, log=log, activity=activity))
        total.operation_ids.add(operation_id)
        total.log_ids.add(str(log.log_id))
    return totals, failures


def _empty_summary() -> WeeklyReportSummary:
    return WeeklyReportSummary(
        total_current_qty=0,
        total_produce_qty=0,
        total_receive_qty=0,
        total_out_qty=0,
        total_defect_qty=0,
        groups_increasing=0,
        groups_decreasing=0,
        groups_unchanged=0,
    )


def _failed_response(
    *,
    week_start: date,
    week_end: date,
    failures: list[WeeklyValidationFailure],
) -> WeeklyReportResponse:
    return WeeklyReportResponse(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        groups=[],
        summary=_empty_summary(),
        warnings=[
            WeeklyWarning(
                level="danger",
                title="집계 검산 실패",
                message="품목과 원인 거래를 확인한 뒤 다시 검산해 주세요.",
            )
        ],
        production_matrix=[],
        basis_version=2,
        report_status="failed",
        validation=WeeklyReportValidation(
            status="failed",
            message="집계 검산 실패: 잘못된 주간 표를 공개하지 않았습니다.",
            failures=failures,
        ),
    )


def _production_matrix(
    db: Session,
    *,
    activities: dict[str, _ActivityTotal],
) -> list[WeeklyProductionModelRow]:
    items = {
        str(item.item_id): item
        for item in db.query(Item).filter(Item.item_id.in_(list(activities))).all()
    }
    symbols = (
        db.query(ProductSymbol)
        .filter(ProductSymbol.symbol.isnot(None), ProductSymbol.model_name.isnot(None))
        .order_by(ProductSymbol.slot)
        .all()
    )
    symbol_names = {row.symbol: row.model_name for row in symbols if len(row.symbol or "") == 1}
    matrix: dict[str, dict[str, Decimal]] = {}
    for item_id, total in activities.items():
        item = items.get(item_id)
        if item is None or total.produce <= 0:
            continue
        model_name = symbol_names.get(item.model_symbol)
        if model_name is None or item.process_type_code not in FINISHED_CODES:
            continue
        matrix.setdefault(model_name, {})[item.process_type_code] = (
            matrix.setdefault(model_name, {}).get(item.process_type_code, Decimal("0"))
            + total.produce
        )
    rows: list[WeeklyProductionModelRow] = []
    for symbol in symbols:
        if len(symbol.symbol or "") != 1:
            continue
        values = matrix.get(symbol.model_name, {})
        quantities = [values.get(code, Decimal("0")) for code in FINISHED_CODES]
        rows.append(
            WeeklyProductionModelRow(
                model_key=symbol.model_name,
                model_label=symbol.model_name,
                tf_qty=quantities[0],
                hf_qty=quantities[1],
                vf_qty=quantities[2],
                nf_qty=quantities[3],
                af_qty=quantities[4],
                pf_qty=quantities[5],
                total_qty=sum(quantities, Decimal("0")),
            )
        )
    return rows


def build_verified_weekly_report(
    db: Session,
    *,
    week_start: date,
    week_end: date,
    today: date,
) -> WeeklyReportResponse:
    """경계 정상재고와 역할별 활동을 두 식으로 검산한 뒤에만 표를 반환한다."""
    try:
        items = _load_boundaries(
            db,
            week_start=week_start,
            week_end=week_end,
            today=today,
        )
    except ValueError as exc:
        return _failed_response(
            week_start=week_start,
            week_end=week_end,
            failures=[_failure(week_start=week_start, reason=str(exc))],
        )

    activities, failures = _collect_activities(
        db,
        week_start=week_start,
        week_end=week_end,
        items=items,
    )
    for item in items:
        total = activities[str(item.item_id)]
        inventory_delta = item.current - item.previous
        if inventory_delta != total.delta:
            failures.append(
                _failure(
                    week_start=week_start,
                    item=item,
                    reason="현재 재고 증감과 활동 열 합계가 일치하지 않습니다.",
                    inventory_delta=inventory_delta,
                    activity_delta=total.delta,
                    operation_ids=total.operation_ids,
                    log_ids=total.log_ids,
                )
            )
    if failures:
        return _failed_response(
            week_start=week_start,
            week_end=week_end,
            failures=failures,
        )

    grouped: dict[str, list[WeeklyItemReport]] = {code: [] for code in FINISHED_CODES}
    for item in items:
        total = activities[str(item.item_id)]
        grouped[item.process_type_code].append(
            WeeklyItemReport(
                item_id=str(item.item_id),
                mes_code=item.mes_code,
                item_name=item.item_name,
                prev_qty=item.previous,
                produce_qty=total.produce,
                receive_qty=total.receive,
                out_qty=total.out,
                defect_qty=total.defect,
                current_qty=item.current,
                delta=item.current - item.previous,
                activity_evidence=total.evidence,
            )
        )

    groups: list[WeeklyGroupReport] = []
    for code in FINISHED_CODES:
        rows = grouped[code]
        produce = sum((row.produce_qty for row in rows), Decimal("0"))
        receive = sum((row.receive_qty for row in rows), Decimal("0"))
        out = sum((row.out_qty for row in rows), Decimal("0"))
        defect = sum((row.defect_qty for row in rows), Decimal("0"))
        groups.append(
            WeeklyGroupReport(
                process_code=code,
                dept_name=DEPARTMENT_NAMES[code],
                label=PROCESS_LABELS[code],
                item_count=len(rows),
                prev_qty=sum((row.prev_qty for row in rows), Decimal("0")),
                increase_qty=produce + receive,
                decrease_qty=out + defect,
                produce_qty=produce,
                receive_qty=receive,
                out_qty=out,
                defect_qty=defect,
                current_qty=sum((row.current_qty for row in rows), Decimal("0")),
                delta=sum((row.delta for row in rows), Decimal("0")),
                items=rows,
            )
        )

    summary = WeeklyReportSummary(
        total_current_qty=sum((group.current_qty for group in groups), Decimal("0")),
        total_produce_qty=sum((group.produce_qty for group in groups), Decimal("0")),
        total_receive_qty=sum((group.receive_qty for group in groups), Decimal("0")),
        total_out_qty=sum((group.out_qty for group in groups), Decimal("0")),
        total_defect_qty=sum((group.defect_qty for group in groups), Decimal("0")),
        groups_increasing=sum(1 for group in groups if group.delta > 0),
        groups_decreasing=sum(1 for group in groups if group.delta < 0),
        groups_unchanged=sum(1 for group in groups if group.delta == 0),
    )
    return WeeklyReportResponse(
        week_start=week_start.isoformat(),
        week_end=week_end.isoformat(),
        groups=groups,
        summary=summary,
        warnings=[],
        production_matrix=_production_matrix(db, activities=activities),
        basis_version=2,
        report_status="verified",
        validation=WeeklyReportValidation(
            status="verified",
            message="모든 품목·공정·전체 합계의 두 검산식이 일치합니다.",
            failures=[],
        ),
    )
