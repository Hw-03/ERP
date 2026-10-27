"""Build all census targets before publishing a prepared set under Control."""
from datetime import datetime
import uuid

from sqlalchemy.orm import Session

from app.models import (DefectStockPool, Department, Employee, Inventory, InventoryLocation, InventoryScope, Item,
                        ShippingAllocation, StocktakeControl, StocktakePendingTarget, StocktakeRound,
                        StocktakeTarget, StocktakeTargetSet)
from app.services import inventory_operations, stocktake_guard
from app.services.stocktake_target_policy import CODE_POLICY, DASHBOARD_POLICY, LEGACY_POLICY, code_department, dashboard_item_eligible, round_policy
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import active_round, append_event, fingerprint, open_preview, preview_response, require_round_manager, seal


def round_targets(db: Session, round_id: uuid.UUID):
    """Unactivated target sets never enter a round's denominator or count commands."""
    return db.query(StocktakeTarget).join(StocktakeTargetSet).filter(StocktakeTargetSet.round_id == round_id)


def candidate_rows(db: Session, item_ids: set[uuid.UUID] | None = None, *,
                   policy: str = LEGACY_POLICY, validate: bool = True,
                   code_snapshots: dict[uuid.UUID, str | None] | None = None) -> list[dict]:
    """Keep legacy rounds intact; new rounds require exactly the code cell and warehouse."""
    scopes = db.query(InventoryScope).order_by(InventoryScope.scope_key).all()
    active_names = {d.name for d in db.query(Department).filter(Department.is_active.is_(True)).all()} | {"창고"}
    by_name = {s.physical_department: s for s in scopes}
    if policy == LEGACY_POLICY and active_names - by_name.keys():
        raise InventoryConflict("TARGET_SET_CHANGED", "신규 위치의 재고 매핑이 준비되지 않았습니다.")
    query = db.query(Item)
    if item_ids is not None:
        query = query.filter(Item.item_id.in_(item_ids))
    items = {i.item_id: i for i in query.all()}
    if policy == DASHBOARD_POLICY:
        items = {key: item for key, item in items.items() if key in (code_snapshots or {}) or
                 dashboard_item_eligible(item.mes_code, item.deleted_at is not None, item.legacy_item_type)}
    eligible = {(i.item_id, s.scope_key) for i in items.values() if i.deleted_at is None
                for s in scopes if s.physical_department in active_names}
    issues = []
    if policy in {CODE_POLICY, DASHBOARD_POLICY}:
        eligible = set()
        for item in items.values():
            if item.deleted_at is not None and not (policy == DASHBOARD_POLICY and item.item_id in (code_snapshots or {})):
                continue
            department = code_department((code_snapshots or {}).get(item.item_id, item.mes_code))
            if department not in by_name or "창고" not in by_name:
                issues.append({"item_id": str(item.item_id), "item_code": item.mes_code,
                               "item_name": item.item_name, "reason": "품목 코드 또는 조사 위치 매핑을 확인해 주세요."})
                continue
            eligible.update((item.item_id, by_name[name].scope_key) for name in (department, "창고"))
    warehouse = db.query(Inventory).filter(Inventory.item_id.in_(items), (Inventory.warehouse_qty != 0) | (Inventory.pending_quantity != 0)).all()
    physical = {(r.item_id, "warehouse") for r in warehouse}
    locations = db.query(InventoryLocation).filter(InventoryLocation.item_id.in_(items), (InventoryLocation.quantity != 0) | (InventoryLocation.pending_quantity != 0)).all()
    allocations = db.query(ShippingAllocation).filter(ShippingAllocation.item_id.in_(items), ShippingAllocation.status == "RESERVED", ShippingAllocation.quantity != 0).all()
    for row in [*locations, *allocations]:
        name = str(getattr(row.department, "value", row.department) or "창고")
        if name not in by_name:
            item = items[row.item_id]
            issue = {"item_id": str(item.item_id), "item_code": item.mes_code, "item_name": item.item_name,
                     "scope_name": name, "reason": "잔존 재고 또는 예약 위치의 매핑을 확인해 주세요."}
            if policy in {CODE_POLICY, DASHBOARD_POLICY}:
                issues.append(issue)
                continue
            raise InventoryConflict("TARGET_SET_CHANGED", f"{item.mes_code or item.item_name}: {issue['reason']}", extra={"items": [issue]})
        physical.add((row.item_id, by_name[name].scope_key))
    pools = db.query(DefectStockPool).filter(DefectStockPool.item_id.in_(items),
        (DefectStockPool.quantity != 0) | (DefectStockPool.pending_quantity != 0)).all()
    if policy in {CODE_POLICY, DASHBOARD_POLICY}:
        physical.update((row.item_id, row.scope_key) for row in pools)
        for item_id, key in sorted(physical - eligible, key=lambda pair: (str(pair[0]), pair[1])):
            item = items[item_id]
            issues.append({"item_id": str(item_id), "item_code": item.mes_code,
                "item_name": item.item_name, "scope_id": key,
                "reason": "삭제된 품목 또는 코드상 위치·창고 밖에 재고나 예약이 남아 있습니다."})
        if issues and validate:
            first = issues[0]
            raise InventoryConflict("TARGET_SET_CHANGED", f"{first['item_code'] or first['item_name']}: {first['reason']}",
                                    extra={"items": issues})
    else:
        eligible.update(physical)
    by_key = {s.scope_key: s for s in scopes}
    return [{"item_id": str(item_id), "scope_key": key, "item_code": items[item_id].mes_code,
             "item_name": items[item_id].item_name, "unit": items[item_id].unit,
             "scope_name": by_key[key].physical_department}
            for item_id, key in sorted(eligible, key=lambda pair: (str(pair[0]), pair[1]))]


def candidate_fingerprint(rows: list[dict]) -> str:
    """Display name/code edits do not rewrite or invalidate the frozen target identity."""
    return fingerprint([{key: row[key] for key in ("item_id", "scope_key", "unit", "scope_name")} for row in rows])


def pending_rows(db: Session, round_id: uuid.UUID) -> list[dict]:
    """Merge current eligibility with candidates already discovered by ordinary writers."""
    admitted_rows = round_targets(db, round_id).all()
    admitted = {(str(row.item_id), row.scope_key) for row in admitted_rows}
    policy = round_policy(db, round_id)
    rows = {(r["item_id"], r["scope_key"]): r for r in candidate_rows(db, policy=policy,
        code_snapshots={row.item_id: row.item_code for row in admitted_rows})}
    for pending in db.query(StocktakePendingTarget).filter_by(round_id=round_id).all():
        if policy in {CODE_POLICY, DASHBOARD_POLICY} and (str(pending.item_id), pending.scope_key) not in rows:
            continue
        rows.setdefault((str(pending.item_id), pending.scope_key), pending.snapshot)
    return [rows[key] for key in sorted(rows) if key not in admitted]


def prepare_set(db: Session, actor: Employee, payload: dict, *, append: bool = False) -> dict:
    """The expensive target inserts occur without an exclusive Control lock."""
    require_round_manager(actor)
    control = db.get(StocktakeControl, 1)
    if control is None or control.inventory_mode != "POOL" or not inventory_operations.is_ledger_active(db):
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "재고 전수조사에 필요한 시스템 설정이 아직 완료되지 않았습니다. 시스템 관리자에게 확인을 요청해 주세요.", status_code=422)
    round_id = uuid.UUID(payload["round_id"]) if append else None
    row = active_round(db, round_id) if append else None
    if not append and control.active_round_id is not None:
        raise InventoryConflict("ROUND_ACTIVE", "이미 진행 중인 조사 회차가 있습니다.")
    policy = round_policy(db, round_id) if append else DASHBOARD_POLICY
    candidates = pending_rows(db, round_id) if append else candidate_rows(db, policy=policy)
    if not candidates:
        if append:
            return {"target_count": 0, "no_targets": True}
        raise InventoryConflict("TARGET_SET_CHANGED", "편입할 조사 대상이 없습니다.")
    set_id = uuid.uuid4()
    manifest = {"set_id": str(set_id), "title": payload.get("title", row.title if row else ""),
                "target_count": len(candidates), "candidate_fingerprint": candidate_fingerprint(candidates),
                "control_epoch": control.epoch, "target_generation": row.target_generation if row else 0,
                "target_policy": policy}
    preview = seal(db, actor, "target_append" if append else "round_start", manifest, round_id)
    db.add(StocktakeTargetSet(set_id=set_id, preview_id=preview.preview_id))
    db.flush()
    db.bulk_insert_mappings(StocktakeTarget, [{**entry, "item_id": uuid.UUID(entry["item_id"]),
                          "target_id": uuid.uuid4(), "set_id": set_id} for entry in candidates])
    return {**preview_response(preview), **({"targets": candidates} if append else {})}


def activate_set(db: Session, actor: Employee, payload: dict, *, append: bool = False) -> dict:
    """Validate the prepared identity and publish one set pointer atomically."""
    require_round_manager(actor)
    control = stocktake_guard.lock_control(db, exclusive=True)
    preview = open_preview(db, payload, "target_append" if append else "round_start")
    if control is None or control.inventory_mode != "POOL" or control.epoch != preview.payload["control_epoch"]:
        raise InventoryConflict("TARGET_SET_CHANGED", "조사 경계가 변경되었습니다. 대상 준비를 다시 진행해 주세요.")
    row = active_round(db, uuid.UUID(payload["round_id"])) if append else None
    if append and (preview.round_id != row.round_id or preview.payload["target_generation"] != row.target_generation):
        raise InventoryConflict("TARGET_SET_CHANGED", "편입 대상 세대가 변경되었습니다.")
    if not append and control.active_round_id is not None:
        raise InventoryConflict("ROUND_ACTIVE", "이미 진행 중인 조사 회차가 있습니다.")
    policy = round_policy(db, row.round_id) if append else preview.payload.get("target_policy", LEGACY_POLICY)
    current = pending_rows(db, row.round_id) if append else candidate_rows(db, policy=policy)
    target_set = db.get(StocktakeTargetSet, uuid.UUID(preview.payload["set_id"]))
    if target_set is None or target_set.round_id is not None or candidate_fingerprint(current) != preview.payload["candidate_fingerprint"]:
        raise InventoryConflict("TARGET_SET_CHANGED", "대상 구성이 변경되었습니다. 다시 미리보기를 준비해 주세요.")
    if append:
        row.target_generation += 1
    else:
        control.epoch += 1
        row = StocktakeRound(round_id=uuid.uuid4(), title=preview.payload["title"], epoch=control.epoch, started_by=actor.employee_id)
        db.add(row)
        db.flush()
        control.active_round_id = row.round_id
    target_set.round_id = row.round_id
    target_set.activated_at = datetime.utcnow()
    db.flush()
    from app.services.work_stocktake_pause import pause_drafts
    pause_drafts(db, row.round_id, affected_cells=current if append else None)
    event = append_event(db, actor, row.round_id, "TARGETS_APPENDED" if append else "ROUND_STARTED", {
        "set_id": str(target_set.set_id), "preview_id": str(preview.preview_id), "target_count": len(current), "target_generation": row.target_generation})
    return {"round_id": str(row.round_id), "epoch": row.epoch, "status": row.status,
            "target_generation": row.target_generation, "event_id": str(event.event_id), "target_count": len(current)}
