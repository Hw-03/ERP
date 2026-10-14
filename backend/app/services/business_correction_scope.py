"""Resolve complete business roots independently from quantity reversal eligibility."""
from dataclasses import dataclass
import json
import uuid

from sqlalchemy import inspect, or_
from sqlalchemy.orm import Session

from app import models as m
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import fingerprint

ROOTS = {"ShippingRequest": m.ShippingRequest, "StockRequest": m.StockRequest,
         "HandoverDoc": m.HandoverDoc, "IoBatch": m.IoBatch}
ROOT_KEYS = {"ShippingRequest": "request_id", "StockRequest": "request_id", "HandoverDoc": "handover_id", "IoBatch": "batch_id"}


def value(item: object) -> object:
    """Normalize database enums and IDs without exposing credentials."""
    return getattr(item, "value", item)


def state(row: object) -> dict:
    """Capture document identity/configuration as well as its status."""
    return json.loads(json.dumps({c.key: value(getattr(row, c.key)) for c in inspect(type(row)).columns}, default=str))


def held(message: str) -> None:
    """An unknown group needs evidence, never an inferred partial correction."""
    raise InventoryConflict("CORRECTION_HELD", message, status_code=422)


@dataclass
class Scope:
    operation: m.InventoryOperation | None
    roots: dict[tuple[str, uuid.UUID], object]
    logs: list[m.TransactionLog]
    movements: list[m.DefectStockMovement]
    effects: list[m.InventoryOperationEffect]
    allocations: list[m.ShippingAllocation]
    item_ids: set[uuid.UUID]
    manifest: dict
    claims: set[tuple[str, uuid.UUID]]
    boundary_effects: list[m.InventoryOperationEffect]


def _active_operation(db: Session, source_type: str, source_id: uuid.UUID) -> m.InventoryOperation | None:
    """Use explicit workflow provenance; never select an item-level quantity log."""
    operations = db.query(m.InventoryOperation).join(m.InventoryOperationEffect).filter(
        m.InventoryOperationEffect.subject_type == source_type,
        m.InventoryOperationEffect.subject_id == str(source_id),
        m.InventoryOperationEffect.effect_kind == m.InventoryOperationEffectKindEnum.WORKFLOW,
        m.InventoryOperation.kind == m.InventoryOperationKindEnum.BUSINESS,
    ).order_by(m.InventoryOperation.created_at.desc()).all()
    active = [op for op in operations if op.action != "business_correction"
              and not db.query(m.InventoryOperation.operation_id).filter_by(reverses_operation_id=op.operation_id).first()
              and not db.query(m.BusinessCorrectionSource).filter(m.BusinessCorrectionSource.source_kind.in_(["operation", "workflow_operation"]),
                                                                 m.BusinessCorrectionSource.source_id == op.operation_id).first()]
    if len(active) > 1 and active[0].created_at == active[1].created_at:
        held("동일 시각의 원업무 순서를 증명할 수 없습니다. 원장 ID와 전체 실행 증빙을 확인해 주세요.")
    return active[0] if active else None


def _legacy_logs(db: Session, source_type: str, root: object) -> list[m.TransactionLog]:
    """Only existing document-level legacy group keys are admissible."""
    query = db.query(m.TransactionLog).filter(m.TransactionLog.cancelled.is_(False))
    if source_type == "ShippingRequest":
        phase = "pickup" if value(root.status) == "PICKED_UP" else "prepare"
        query = query.filter(m.TransactionLog.shipping_request_id == root.request_id, m.TransactionLog.shipping_phase == phase)
    elif source_type == "StockRequest" and root.request_code:
        query = query.filter(m.TransactionLog.reference_no == root.request_code)
    elif source_type == "HandoverDoc" and root.handover_code:
        query = query.filter(m.TransactionLog.reference_no == root.handover_code)
    else:
        held("원업무의 전체 실행 로그를 연결할 문서 번호가 없습니다. 문서·라인·실행 증빙을 확인해 주세요.")
    logs = query.order_by(m.TransactionLog.log_id).all()
    if not logs or any(log.operation_id is not None for log in logs):
        held("과거 원업무의 전체 실행 집합을 확정할 수 없습니다. 연결 원장과 문서별 로그를 확인해 주세요.")
    if len({log.operation_batch_id for log in logs if log.operation_batch_id}) > 1:
        held("원문서에 여러 실행 묶음이 연결되어 있습니다. 실행 회차별 증빙이 필요합니다.")
    batch_ids = {log.operation_batch_id for log in logs if log.operation_batch_id}
    if batch_ids:
        entire = {log.log_id for log in db.query(m.TransactionLog).filter(m.TransactionLog.operation_batch_id.in_(batch_ids)).all()}
        if entire != {log.log_id for log in logs}:
            held("같은 실행 묶음에 다른 로그가 있습니다. 묶음 전체의 문서와 수량 증빙을 검토해 주세요.")
    if source_type == "StockRequest":
        line_ids = {line.operation_line_id for line in root.lines if line.operation_line_id}
        if not line_ids or {log.operation_line_id for log in logs} != line_ids:
            held("요청 전체 라인과 과거 실행 로그가 일대일로 연결되지 않습니다. 원자 실행 집합을 확인해 주세요.")
        if root.operation_batch_id:
            batch = db.get(m.IoBatch, root.operation_batch_id)
            if batch and batch.sub_type == "internal_use_out":
                held("원장 없는 사용출고는 승인된 전체 요청 묶음을 증명해야 합니다. 묶음 실행 증빙을 먼저 검토해 주세요.")
    if source_type == "HandoverDoc":
        from collections import Counter
        expected, actual = Counter(), Counter()
        for line in root.lines:
            expected[(line.item_id, value(root.from_department), "PRODUCTION")] -= int(line.quantity)
            expected[(line.item_id, value(root.to_department), "PRODUCTION")] += int(line.quantity)
        for log in logs:
            if not log.inventory_effect:
                held("인수인계 로그에 위치별 이동 증빙이 없습니다. 출발·도착과 수량을 확인해 주세요.")
            for effect in log.inventory_effect:
                if effect.get("scope") != "location" or not isinstance(effect.get("delta"), int):
                    held("인수인계 로그의 물리 이동 형식을 확정할 수 없습니다.")
                actual[(log.item_id, effect.get("department"), effect.get("status"))] += effect["delta"]
        if {k: v for k, v in expected.items() if v} != {k: v for k, v in actual.items() if v}:
            held("인수인계 전체 라인 수량과 출발·도착 위치별 이동량이 다릅니다. 문서와 이동 증빙을 확인해 주세요.")
    return logs


def lock_roots(db: Session, identities: set[tuple[str, uuid.UUID]]) -> dict[tuple[str, uuid.UUID], object]:
    """Cancellation, correction and repair acquire workflow parents before items."""
    identities = set(identities)
    for name, ident in list(identities):
        if name == "StockRequest":
            row = db.get(m.StockRequest, ident)
            if row is not None and row.operation_batch_id:
                identities.add(("IoBatch", row.operation_batch_id))
    order = {"IoBatch": 0, "ShippingRequest": 1, "StockRequest": 2, "HandoverDoc": 3}
    roots = {}
    for name, ident in sorted(identities, key=lambda k: (order[k[0]], str(k[1]))):
        query = db.query(ROOTS[name]).filter(getattr(ROOTS[name], ROOT_KEYS[name]) == ident)
        if db.get_bind().dialect.name != "sqlite":
            query = query.with_for_update()
        row = query.populate_existing().one_or_none()
        if row is not None:
            roots[(name, ident)] = row
            relationships = [r.key for r in inspect(type(row)).relationships]
            if relationships:
                db.expire(row, relationships)
    return roots


def resolve(db: Session, source_type: str, source_id: uuid.UUID, *, lock: bool = False) -> Scope:
    """Resolve roots first, lock them in order, then freeze complete members and lineage."""
    operation = db.get(m.InventoryOperation, source_id) if source_type == "InventoryOperation" else _active_operation(db, source_type, source_id)
    if source_type == "InventoryOperation" and operation is None:
        raise InventoryConflict("NOT_FOUND", "원업무를 찾을 수 없습니다.", status_code=404)
    roots, effects, movements = {}, [], []
    if operation:
        if operation.kind != m.InventoryOperationKindEnum.BUSINESS or operation.action == "business_correction" or operation.domain in {"stocktake", "pool"}:
            held("해당 원장은 업무 상태 정정 대상이 아닙니다.")
        effects = db.query(m.InventoryOperationEffect).filter_by(operation_id=operation.operation_id).order_by(m.InventoryOperationEffect.effect_id).all()
        workflows = [e for e in effects if e.effect_kind == m.InventoryOperationEffectKindEnum.WORKFLOW]
        if not workflows or any(e.subject_type not in ROOTS for e in workflows):
            held("원업무에 정정할 문서의 전체 연결이 없습니다. 수량만 바꾸는 거래는 현재 업무로 처리해 주세요.")
        for effect in workflows:
            roots[(effect.subject_type, uuid.UUID(effect.subject_id))] = None
        logs = db.query(m.TransactionLog).filter_by(operation_id=operation.operation_id).order_by(m.TransactionLog.log_id).all()
        movements = db.query(m.DefectStockMovement).filter_by(operation_id=operation.operation_id).order_by(m.DefectStockMovement.movement_id).all()
    else:
        roots[(source_type, source_id)] = None
        root = db.get(ROOTS[source_type], source_id)
        if root is None:
            raise InventoryConflict("NOT_FOUND", "원문서를 찾을 수 없습니다.", status_code=404)
        logs = _legacy_logs(db, source_type, root)
    for name, ident in list(roots):
        row = db.get(ROOTS[name], ident)
        if row is None:
            held("원업무의 연결 문서가 없습니다.")
        if name == "StockRequest" and row.operation_batch_id:
            roots[("IoBatch", row.operation_batch_id)] = None
    roots = lock_roots(db, set(roots)) if lock else {(name, ident): db.get(ROOTS[name], ident) for name, ident in roots}
    if operation:
        db.refresh(operation)
        for log in logs:
            db.refresh(log)
    else:
        # Root locks protect legacy membership; reselect after any lock wait.
        logs = _legacy_logs(db, source_type, roots[(source_type, source_id)])
    root_rows = [{"type": name, "state": state(row)} for (name, _), row in roots.items()]
    members, related, allocations, item_ids = [], [], [], {log.item_id for log in logs}
    boundary_effects, boundary_ops, boundary_logs = [], set(), set()
    for (name, ident), row in roots.items():
        lines = list(row.lines) if name in {"StockRequest", "HandoverDoc"} else []
        members.extend({"type": type(line).__name__, "state": state(line)} for line in lines)
        item_ids.update(line.item_id for line in lines)
        if name == "ShippingRequest":
            selected = db.query(m.ShippingAllocation).filter_by(request_id=ident).order_by(m.ShippingAllocation.allocation_id).populate_existing().all()
            allocations.extend(a for a in selected if a.status in {"RESERVED", "CONSUMED"})
            item_ids.update(a.item_id for a in selected)
            members.extend({"type": "ShippingAllocation", "state": state(a)} for a in selected)
            members.extend({"type": type(line).__name__, "state": state(line)} for line in [*row.bom_lines, *row.companion_lines, *row.checklist_lines])
            boundary_logs.update(log.log_id for log in db.query(m.TransactionLog).filter_by(shipping_request_id=ident, cancelled=False).all())
        if name == "IoBatch":
            related.extend({"type": "StockRequest", "state": state(r)} for r in db.query(m.StockRequest).filter_by(operation_batch_id=ident).all())
            members.extend({"type": "IoLine", "state": state(line)} for bundle in row.bundles for line in bundle.lines)
        history = db.query(m.InventoryOperationEffect).filter_by(subject_type=name, subject_id=str(ident)).all()
        # Explicit member IDs, not timestamps, define the invalidated workflow boundary.
        related.extend({"type": "InventoryOperationEffect", "state": state(effect)} for effect in history)
        if name == "ShippingRequest":
            boundary_effects.extend(history)
            boundary_ops.update(effect.operation_id for effect in history)
    for movement in movements:
        item_ids.add(db.get(m.DefectStockPool, movement.pool_id).item_id)
    claims = {("transaction", log.log_id) for log in logs} | {("pool_movement", row.movement_id) for row in movements}
    claims |= {("allocation", a.allocation_id) for a in allocations}
    if operation:
        claims.add(("operation", operation.operation_id))
    # Previously corrected phases remain historical; new phases acquire new IDs.
    existing = {(r.source_kind, r.source_id) for r in db.query(m.BusinessCorrectionSource).all()}
    claims |= {("workflow_operation", ident) for ident in boundary_ops if ("workflow_operation", ident) not in existing and ("operation", ident) not in existing}
    claims |= {("transaction", ident) for ident in boundary_logs if ("transaction", ident) not in existing}
    manifest = {"atomic_group_key": f"operation:{operation.operation_id}" if operation else "legacy:" + fingerprint(sorted(str(log.log_id) for log in logs)),
        "operation_id": str(operation.operation_id) if operation else None,
        "roots": sorted(root_rows, key=lambda r: (r["type"], fingerprint(r["state"]))),
        "members": sorted(members, key=fingerprint), "related": sorted(related, key=fingerprint),
        "logs": [state(log) for log in logs], "effects": [state(e) for e in effects], "movements": [state(row) for row in movements],
        "claims": sorted((kind, str(ident)) for kind, ident in claims)}
    return Scope(operation, roots, logs, movements, effects, allocations, item_ids, manifest, claims, boundary_effects)


def authorize(actor: m.Employee, scope: Scope) -> None:
    """Source labels cannot bypass the actual root's original cancellation authority."""
    approver = (actor.warehouse_role or "none").lower() != "none" or (actor.department_role or "none").lower() != "none"
    for (name, _), root in scope.roots.items():
        if name == "ShippingRequest":
            continue
        if name == "IoBatch":
            if root.sub_type != "internal_use_out" and any(n == "StockRequest" and r.operation_batch_id == root.batch_id for (n, _), r in scope.roots.items()):
                continue
            allowed = root.requester_employee_id == actor.employee_id or (root.sub_type != "internal_use_out" and approver)
        elif name == "StockRequest":
            allowed = root.requester_employee_id == actor.employee_id or approver
        else:
            owner = scope.operation.actor_employee_id if scope.operation else root.received_by_employee_id
            allowed = owner == actor.employee_id or approver
        if not allowed:
            raise InventoryConflict("FORBIDDEN", "원업무 전체에 대한 정정 요청 권한이 없습니다.", status_code=403)


def validate_eligible(db: Session, scope: Scope, target_status: str) -> None:
    """Only completed document states can be corrected; no partial line selection."""
    if any(db.get(m.BusinessCorrectionSource, claim) for claim in scope.claims):
        raise InventoryConflict("BUSINESS_CORRECTED", "이미 업무 정정된 원업무입니다.")
    if scope.operation and db.query(m.InventoryOperation).filter_by(reverses_operation_id=scope.operation.operation_id).first():
        held("이미 수량 취소된 원업무는 정정할 수 없습니다.")
    if any(log.cancelled for log in scope.logs):
        held("원업무에 이미 취소된 실행 로그가 있습니다.")
    for (name, _), root in scope.roots.items():
        current = value(root.status)
        if name == "ShippingRequest":
            if current not in {"PREPARED", "PICKED_UP"}:
                held("준비 완료 또는 픽업 완료 상태의 출하만 정정할 수 있습니다.")
            if scope.operation and scope.operation.domain == "shipping" and scope.operation.action != ("pickup" if current == "PICKED_UP" else "prepare"):
                held("후속 출하 단계가 있습니다. 현재 유효한 단계의 전체 원업무로 새 요청을 작성해 주세요.")
        elif name == "StockRequest":
            if current != "completed" or any(value(line.status) != "completed" for line in root.lines):
                held("요청과 전체 라인이 모두 완료된 상태인지 확인해 주세요.")
        elif name == "HandoverDoc" and current != "received":
            held("인수 완료된 문서만 정정할 수 있습니다.")
        elif name == "IoBatch" and not any(n == "StockRequest" for n, _ in scope.roots) and current != "completed":
            held("독립 입출고 묶음은 실행 완료 상태만 정정할 수 있습니다.")
        if name != "ShippingRequest" and target_status != "CANCELLED":
            held("출하 이외의 완료 문서는 정정 후 종결해야 합니다.")
