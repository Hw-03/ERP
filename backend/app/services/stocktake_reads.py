"""Cursor reads preserve frozen target identity while exposing current display names."""
import base64
import json
import uuid

from sqlalchemy import and_, case, exists, false, func, or_, true
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from app.models import DefectStockPool, InventoryLocation, Item, ProductSymbol, StocktakeCount, StocktakeEvent, StocktakeGate, StocktakeReceipt, StocktakeRound, StocktakeTarget
from app.services.inventory_read import inventory_summaries
from app.services.stocktake_target_policy import code_department, code_department_expression
from app.services import stocktake_counts, stocktake_targets
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import fingerprint, receipt_response


def get_round(db: Session, round_id: uuid.UUID) -> StocktakeRound:
    """Historic rounds are readable but never implicitly reactivated."""
    row = db.get(StocktakeRound, round_id)
    if row is None:
        raise InventoryConflict("NOT_FOUND", "회차를 찾을 수 없습니다.", status_code=404)
    return row


def round_response(row: StocktakeRound) -> dict:
    """Use explicit UTC timestamps at the HTTP boundary."""
    return {"round_id": str(row.round_id), "title": row.title, "status": row.status, "epoch": row.epoch,
            "target_generation": row.target_generation, "started_by": str(row.started_by),
            "started_at": row.started_at.isoformat() + "Z", "closed_at": row.closed_at.isoformat() + "Z" if row.closed_at else None}


def _cursor(last: list, context: str) -> str:
    """Bind the complete display-order key to filters and target generation."""
    return base64.urlsafe_b64encode(json.dumps({"v": 2, "last": last, "context": context}).encode()).decode()


def _position(cursor: str | None, context: str) -> list | None:
    """Old UUID-only cursors must restart instead of skipping the newly ordered list."""
    if not cursor:
        return None
    try:
        value = json.loads(base64.b64decode(cursor, altchars=b"-_", validate=True))
        if not isinstance(value, dict):
            raise ValueError("Invalid cursor envelope")
        if value.get("v") != 2 or value.get("context") != context:
            raise InventoryConflict("TARGET_CURSOR_STALE", "목록 순서 또는 조건이 변경되었습니다. 처음부터 다시 조회해 주세요.")
        last = value["last"]
        if not isinstance(last, list) or len(last) != 8 or any(type(last[i]) is not int for i in (0, 1, 2, 5)):
            raise ValueError("Invalid display-order key")
        if any(not isinstance(last[i], str) for i in (3, 4, 6, 7)):
            raise ValueError("Invalid display-order key")
        uuid.UUID(last[4])
        uuid.UUID(last[7])
        return last
    except (ValueError, TypeError, KeyError) as exc:
        raise InventoryConflict("VALIDATION_ERROR", "목록 커서가 올바르지 않습니다.", status_code=422) from exc


def _owned_waiting_condition(actor_id: uuid.UUID, round_: StocktakeRound) -> ColumnElement[bool]:
    """Use the latest count and its still-current gate for every waiting consumer."""
    return and_(round_.status == "ACTIVE", StocktakeCount.owner_id == actor_id,
                StocktakeCount.status == "CONFIRMED", StocktakeCount.confirmation_revision_id.is_not(None),
                exists().where(StocktakeGate.item_id == StocktakeTarget.item_id,
                    StocktakeGate.scope_key == StocktakeTarget.scope_key,
                    StocktakeGate.active_count_id == StocktakeCount.count_id,
                    StocktakeGate.fence == StocktakeCount.fence,
                    StocktakeGate.round_id == round_.round_id, StocktakeGate.round_epoch == round_.epoch,
                    StocktakeGate.quantity_revision == StocktakeCount.quantity_revision))


def owned_waiting_summary(db: Session, round_id: uuid.UUID, actor_id: uuid.UUID) -> dict:
    """Count pending items independently of page/search filters and location KPI."""
    round_ = get_round(db, round_id)
    query = stocktake_targets.round_targets(db, round_id).outerjoin(
        StocktakeCount, StocktakeTarget.latest_count_id == StocktakeCount.count_id)
    query = query.filter(_owned_waiting_condition(actor_id, round_), or_(
        StocktakeTarget.scope_key == "warehouse",
        StocktakeTarget.scope_name == code_department_expression(StocktakeTarget.item_code)))
    items, locations = query.with_entities(func.count(func.distinct(StocktakeTarget.item_id)),
                                          func.count(StocktakeTarget.target_id)).one()
    return {"items": items, "locations": locations}


def waiting_selection(db: Session, round_id: uuid.UUID, actor_id: uuid.UUID, **filters: object) -> dict:
    """Freeze all matching owned revisions, including locations outside loaded pages."""
    result = targets(db, round_id, group_by_item=True, waiting_owner_id=actor_id, limit=None, **filters)
    return {"items": [location for item in result["items"] for location in item["location_targets"]
                      if location["waiting_eligible"]], "total_items": result["total_items"]}


def targets(db: Session, round_id: uuid.UUID, *, scope_id: str | None = None, status: str | None = None,
            search: str = "", cursor: str | None = None, limit: int | None = 50,
            scope_kind: str | None = None, model_slots: list[int] | None = None,
            process_steps: list[str] | None = None, logic: str = "AND", status_group: str | None = None,
            group_by_item: bool = False, departments: list[str] | None = None,
            waiting_owner_id: uuid.UUID | None = None) -> dict:
    """Filter the full denominator before paging in the dashboard's saved item order."""
    round_ = get_round(db, round_id)
    slots, steps = sorted(set(model_slots or [])), sorted(set(process_steps or []))
    depts = sorted(set(departments or []))
    context_fields = [str(round_id), round_.target_generation, scope_id, status, search,
                      scope_kind, slots, steps, logic, status_group, depts,
                      "dashboard-v5-owned-waiting" if waiting_owner_id else ("dashboard-v4-item-kpi" if group_by_item else "dashboard-v2")]
    if waiting_owner_id:
        context_fields.append(str(waiting_owner_id))
    context = fingerprint(context_fields)
    last = _position(cursor, context)
    query = stocktake_targets.round_targets(db, round_id).join(Item).outerjoin(
        StocktakeCount, StocktakeTarget.latest_count_id == StocktakeCount.count_id)
    code_scope = StocktakeTarget.scope_name == code_department_expression(StocktakeTarget.item_code)
    canonical_scope = or_(code_scope, StocktakeTarget.scope_key == "warehouse")
    if waiting_owner_id:
        query = query.filter(_owned_waiting_condition(waiting_owner_id, round_))
    item_kpi = group_by_item and (status_group is not None or status == "APPLIED")
    if item_kpi:
        # Aggregate the complete item before search/group filters or cursor pagination.
        states = stocktake_targets.round_targets(db, round_id).outerjoin(
            StocktakeCount, StocktakeTarget.latest_count_id == StocktakeCount.count_id)
        raw = func.coalesce(StocktakeCount.status, "UNCOUNTED")
        totals = states.with_entities(StocktakeTarget.item_id.label("item_id"),
            func.count().label("locations"),
            func.sum(case((raw.in_(["CONFIRMED", "APPLIED"]), 1), else_=0)).label("confirmed"),
            func.sum(case((raw == "APPLIED", 1), else_=0)).label("applied")).group_by(StocktakeTarget.item_id).subquery()
        query = query.join(totals, totals.c.item_id == StocktakeTarget.item_id)
        condition = totals.c.applied == totals.c.locations if status == "APPLIED" else (
            totals.c.confirmed < totals.c.locations if status_group == "UNCONFIRMED" else totals.c.confirmed == totals.c.locations)
        query = query.filter(condition)
        if status_group == "CONFIRMED_WAITING":
            query = query.filter(totals.c.applied < totals.c.locations)
    if scope_id:
        query = query.filter(StocktakeTarget.scope_key == scope_id)
    effective = case((StocktakeCount.count_id.is_(None), "UNCOUNTED"),
                     ((StocktakeCount.status != "APPLIED") & (round_.status != "ACTIVE"), "CLOSED_UNAPPLIED"),
                     else_=StocktakeCount.status)
    if status and not item_kpi:
        query = query.filter(effective == status)
    if status_group and not item_kpi:
        raw_status = func.coalesce(StocktakeCount.status, "UNCOUNTED")
        group = ["UNCOUNTED", "DRAFT", "ABANDONED"] if status_group == "UNCONFIRMED" else (["CONFIRMED"] if status_group == "CONFIRMED_WAITING" else ["CONFIRMED", "APPLIED"])
        query = query.filter(raw_status.in_(group))
    if search:
        term = "%" + search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"
        query = query.filter(or_(StocktakeTarget.item_code.ilike(term, escape="\\"),
            StocktakeTarget.item_name.ilike(term, escape="\\"), Item.item_name.ilike(term, escape="\\"),
            Item.mes_code.ilike(term, escape="\\")))
    if group_by_item:
        query = query.filter(canonical_scope)
    groups = []
    if depts:
        groups.append(code_department_expression(Item.mes_code).in_(depts))
    if scope_kind:
        groups.append(StocktakeTarget.scope_key == "warehouse" if scope_kind == "warehouse" else code_scope)
    if slots:
        symbols = db.query(ProductSymbol).filter(ProductSymbol.symbol.is_not(None)).all()
        model_conditions = [Item.model_symbol.contains(symbol.symbol, autoescape=True)
                            for symbol in symbols if symbol.slot in slots]
        if 0 in slots:
            known = [Item.model_symbol.contains(symbol.symbol, autoescape=True) for symbol in symbols]
            model_conditions.append(~or_(*known) if known else true())
        groups.append(or_(*model_conditions) if model_conditions else false())
    if steps:
        process_conditions = []
        if any(step in {"R", "A", "F"} for step in steps):
            process_conditions.append(func.substr(Item.process_type_code, 2, 1).in_([s for s in steps if s in {"R", "A", "F"}]))
        if "DEFECT" in steps:
            process_conditions.append(or_(
                db.query(InventoryLocation.location_id).filter(InventoryLocation.item_id == Item.item_id,
                    InventoryLocation.status == "DEFECTIVE", InventoryLocation.quantity > 0).exists(),
                db.query(DefectStockPool.pool_id).filter(DefectStockPool.item_id == Item.item_id,
                    DefectStockPool.category == "DEFECT", DefectStockPool.quantity > 0).exists()))
        if "OBSOLETE" in steps:
            process_conditions.append(or_(Item.legacy_item_type == "불용",
                db.query(DefectStockPool.pool_id).filter(DefectStockPool.item_id == Item.item_id,
                    DefectStockPool.category == "OBSOLETE", DefectStockPool.quantity > 0).exists()))
        groups.append(or_(*process_conditions))
    if groups:
        query = query.filter(or_(*groups) if logic == "OR" else and_(*groups))
    scope_rank = case((code_scope, 0), (StocktakeTarget.scope_key == "warehouse", 1), else_=2)
    ordering = [case((Item.deleted_at.is_(None), 0), else_=1), case((Item.sort_order.is_(None), 0), else_=1),
                func.coalesce(Item.sort_order, 0), func.coalesce(Item.mes_code, ""), Item.item_id,
                scope_rank, StocktakeTarget.scope_key, StocktakeTarget.target_id]
    matching = query
    total_items = query.with_entities(StocktakeTarget.item_id).distinct().count() if waiting_owner_id else None
    page_ordering = ordering[:5] if group_by_item else ordering
    if last:
        values = [*last]
        values[4], values[7] = uuid.UUID(values[4]), uuid.UUID(values[7])
        query = query.filter(or_(*[and_(*[page_ordering[j] == values[j] for j in range(i)], page_ordering[i] > values[i])
                                   for i in range(len(page_ordering))]))
    if group_by_item:
        # Page distinct items first; a location filter selects items, not their available editor tabs.
        item_query = query.with_entities(*page_ordering).distinct().order_by(*page_ordering)
        item_page = (item_query.limit(limit + 1) if limit is not None else item_query).all()
        page_ids = [entry[4] for entry in item_page[:limit]]
        matching_ids = {entry[0] for entry in matching.with_entities(StocktakeTarget.target_id).filter(
            StocktakeTarget.item_id.in_(page_ids)).all()}
        rows = stocktake_targets.round_targets(db, round_id).join(Item).filter(
            StocktakeTarget.item_id.in_(page_ids), canonical_scope).order_by(*ordering).all()
        has_more = limit is not None and len(item_page) > limit
    else:
        ordered_query = query.order_by(*ordering)
        rows = (ordered_query.limit(limit + 1) if limit is not None else ordered_query).all()
        has_more = limit is not None and len(rows) > limit
        rows = rows[:limit]
    items = []
    counts = {c.count_id: c for c in db.query(StocktakeCount).filter(
        StocktakeCount.count_id.in_([r.latest_count_id for r in rows if r.latest_count_id])).all()}
    confirmations = {event.event_id: event for event in db.query(StocktakeEvent).filter(
        StocktakeEvent.event_id.in_([count.confirmation_revision_id for count in counts.values() if count.confirmation_revision_id]),
        StocktakeEvent.kind == "COUNT_CONFIRMED").all()}
    gates = {(g.item_id, g.scope_key): g for g in db.query(StocktakeGate).filter(
        StocktakeGate.item_id.in_([r.item_id for r in rows])).all()}
    current = {i.item_id: i for i in db.query(Item).filter(Item.item_id.in_([r.item_id for r in rows])).all()}
    inventory = inventory_summaries(db, [r.item_id for r in rows])
    for row in rows:
        count, gate = counts.get(row.latest_count_id), gates.get((row.item_id, row.scope_key))
        confirmation = confirmations.get(count.confirmation_revision_id) if count else None
        current_status = count.status if count else "UNCOUNTED"
        if count and round_.status != "ACTIVE" and count.status != "APPLIED":
            current_status = "CLOSED_UNAPPLIED"
        items.append({"target_id": str(row.target_id), "item_id": str(row.item_id), "scope_id": row.scope_key,
            "item_code": row.item_code, "item_name": row.item_name, "unit": row.unit, "scope_name": row.scope_name,
            "current_item_code": current[row.item_id].mes_code, "current_item_name": current[row.item_id].item_name,
            "target_version": row.version, "version": count.version if count else 0, "fence": gate.fence if gate else 0,
            "status": current_status, "quantities": count.quantities if count else None,
            "confirmation_revision_id": str(count.confirmation_revision_id) if count and count.confirmation_revision_id else None,
            "confirmed_name": confirmation.actor_name if confirmation and confirmation.count_id == count.count_id else None,
            "current_inventory": inventory[row.item_id],
            "count": stocktake_counts.response(count, gate) if count and gate else None})
    if group_by_item:
        locations: dict[str, list[dict]] = {}
        for entry in items:
            if waiting_owner_id:
                entry["waiting_eligible"] = uuid.UUID(entry["target_id"]) in matching_ids
            locations.setdefault(entry["item_id"], []).append(entry)
        items = [{**next(entry for entry in locations[str(item_id)] if uuid.UUID(entry["target_id"]) in matching_ids),
                  "location_targets": locations[str(item_id)]} for item_id in page_ids]
    next_cursor = None
    if has_more:
        last_id = uuid.UUID(items[-1]["target_id"])
        row = next(row for row in rows if row.target_id == last_id)
        item = current[row.item_id]
        rank = 0 if row.scope_name == code_department(row.item_code) else 1 if row.scope_key == "warehouse" else 2
        key = [0 if item.deleted_at is None else 1, 0 if item.sort_order is None else 1,
               item.sort_order or 0, item.mes_code or "", str(item.item_id), rank, row.scope_key, str(row.target_id)]
        next_cursor = _cursor(key, context)
    return {"items": items, "next_cursor": next_cursor, **({"total_items": total_items} if waiting_owner_id else {})}


def receipt(db: Session, actor_id: uuid.UUID, kind: str, key: str) -> dict:
    """A receipt belongs to the authenticated actor and exact command namespace."""
    row = db.query(StocktakeReceipt).filter_by(actor_id=actor_id, command_kind=kind, idempotency_key=key).one_or_none()
    if row is None or row.response is None:
        raise InventoryConflict("NOT_FOUND", "성공 영수증을 찾을 수 없습니다.", status_code=404)
    return receipt_response(row)
