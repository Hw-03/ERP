"""Read-only close snapshot over the admitted target set and latest count attempts."""
import uuid
from collections import defaultdict
from typing import Iterable

from sqlalchemy.orm import Session

from app.models import (DefectStockPool, Inventory, InventoryLocation, InventoryScope, LocationStatusEnum,
                        ShippingAllocation, StocktakeCount, StocktakePendingTarget, StocktakeTarget, StocktakeTargetSet)
from app.services.stocktake_common import CATEGORIES


def _chunks(values: list[uuid.UUID], size: int = 500) -> Iterable[list[uuid.UUID]]:
    """Bound SQLite parameters while keeping query count proportional to batches, not targets."""
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def _bulk(db: Session, model: type, item_ids: list[uuid.UUID]) -> list:
    """Read one model for report items without per-target lookups."""
    return [row for chunk in _chunks(item_ids) for row in db.query(model).filter(model.item_id.in_(chunk)).all()]


def _figures(db: Session, targets: list[StocktakeTarget]) -> dict[tuple[uuid.UUID, str], dict]:
    """Match count figures for every admitted cell from bulk physical and reservation rows."""
    item_ids = sorted({target.item_id for target in targets}, key=str)
    scopes = {row.scope_key: row.physical_department for row in db.query(InventoryScope).all()}
    inventory = {row.item_id: row for row in _bulk(db, Inventory, item_ids)}
    locations = {(row.item_id, row.department, row.status): row for row in _bulk(db, InventoryLocation, item_ids)}
    pools = {(row.item_id, row.scope_key, row.category.lower()): row for row in _bulk(db, DefectStockPool, item_ids)}
    allocations = defaultdict(int)
    for row in _bulk(db, ShippingAllocation, item_ids):
        if row.status == "RESERVED":
            allocations[(row.item_id, row.department or "창고")] += int(row.quantity)
    result = {}
    for target in targets:
        department = scopes[target.scope_key]
        normal = inventory.get(target.item_id) if target.scope_key == "warehouse" else locations.get(
            (target.item_id, department, LocationStatusEnum.PRODUCTION))
        defective = locations.get((target.item_id, department, LocationStatusEnum.DEFECTIVE))
        quantities = {"normal": int(normal.warehouse_qty if target.scope_key == "warehouse" and normal else
                                     normal.quantity if normal else 0)}
        reservations = {"normal": int(normal.pending_quantity if normal else 0) + allocations[(target.item_id, department)]}
        for category in CATEGORIES[1:]:
            pool = pools.get((target.item_id, target.scope_key, category))
            quantities[category] = int(pool.quantity) if pool else 0
            reservations[category] = int(pool.pending_quantity) if pool else 0
        consistent = (sum(quantities[c] for c in CATEGORIES[1:]) == int(defective.quantity if defective else 0)
                      and sum(reservations[c] for c in CATEGORIES[1:]) == int(defective.pending_quantity if defective else 0))
        result[(target.item_id, target.scope_key)] = {"quantities": quantities, "reservations": reservations,
                                                        "pool_consistent": consistent}
    return result


def _classification(count: StocktakeCount | None, selected_ids: set[str]) -> str:
    """Only the latest confirmed or applied attempt contributes to completion."""
    if count is None:
        return "UNCOUNTED"
    if count.status == "APPLIED":
        return "ALREADY_APPLIED"
    if count.status == "CONFIRMED":
        return "SELECTED_APPLY" if str(count.confirmation_revision_id) in selected_ids else "CONFIRMED_EXCLUDED"
    return count.status


def _totals(entries: list[dict]) -> dict[str, int]:
    """Count target states; never add quantities whose units may differ."""
    admitted = [entry for entry in entries if entry["classification"] != "PENDING_UNADMITTED"]
    classes = [entry["classification"] for entry in admitted]
    return {"total": len(admitted), "confirmed": sum(c in {"SELECTED_APPLY", "CONFIRMED_EXCLUDED", "ALREADY_APPLIED"} for c in classes),
            "applied": classes.count("ALREADY_APPLIED"), "selected": classes.count("SELECTED_APPLY"),
            "unconfirmed": sum(c in {"DRAFT", "UNCOUNTED", "ABANDONED"} for c in classes),
            "confirmed_excluded": classes.count("CONFIRMED_EXCLUDED"),
            "held": sum(bool(entry["held_reasons"]) for entry in admitted),
            "pending": len(entries) - len(admitted)}


def item_totals(entries: list[dict], *, project_selected: bool = False) -> dict[str, int]:
    """Every admitted location must finish before its item contributes to a KPI."""
    grouped: dict[str, list[str]] = defaultdict(list)
    for entry in entries:
        state = entry["classification"]
        if state != "PENDING_UNADMITTED":
            grouped[entry["item_id"]].append("ALREADY_APPLIED" if project_selected and state == "SELECTED_APPLY" else state)
    confirmed = sum(all(state in {"SELECTED_APPLY", "CONFIRMED_EXCLUDED", "ALREADY_APPLIED"} for state in states)
                    for states in grouped.values())
    applied = sum(all(state == "ALREADY_APPLIED" for state in states) for states in grouped.values())
    return {"total": len(grouped), "confirmed": confirmed, "applied": applied, "unconfirmed": len(grouped) - confirmed}


def _quantity_unit(unit: str | None) -> str:
    """Combine EA aliases while preserving all other frozen target units."""
    value = (unit or "").strip()
    return "EA" if value.upper() == "EA" or value == "개" else value or "미지정"


def _quantity_total(quantities: dict[str, int | None] | None) -> int | None:
    """Partial observations contribute entered categories; absent evidence stays unknown."""
    values = [quantities.get(category) for category in CATEGORIES] if quantities else []
    entered = [value for value in values if value is not None]
    return sum(entered) if entered else None


def worker_progress(db: Session, round_id: uuid.UUID, entries: list[dict], *,
                    project_selected: bool = False) -> list[dict]:
    """Include all participants; deduplicate started items and valid results per worker.

    Previous attempts retain participation when another worker takes over. Confirmation
    and application use only the report's valid latest results, or frozen close evidence.
    Survey quantities use each worker's last nonblank attempt per item and location;
    autosaves update that attempt rather than adding repeated observations.
    """
    groups: dict[str, dict] = {}
    with db.no_autoflush:
        attempts = (db.query(StocktakeCount.owner_id, StocktakeCount.owner_name, StocktakeTarget.item_id,
                             StocktakeTarget.scope_key, StocktakeTarget.unit, StocktakeCount.quantities)
                    .join(StocktakeTarget, StocktakeCount.target_id == StocktakeTarget.target_id)
                    .filter(StocktakeCount.round_id == round_id)
                    .order_by(StocktakeCount.created_at, StocktakeCount.count_id).all())
    last_saved: dict[tuple[str, str, str], tuple[str, int | None]] = {}
    target_units: dict[tuple[str, str], str] = {}
    item_units: dict[str, set[str]] = defaultdict(set)
    for owner_id, owner_name, item_id, scope_key, raw_unit, quantities in attempts:
        group = groups.setdefault(str(owner_id), {"name": owner_name, "surveyed": set(), "confirmed": set(), "applied": set(), "quantities": {}})
        group["name"] = owner_name
        group["surveyed"].add(str(item_id))
        unit = _quantity_unit(raw_unit)
        target_units[(str(item_id), scope_key)] = unit
        item_units[str(item_id)].add(unit)
        group["quantities"].setdefault(unit, {"unit": unit, "surveyed": 0, "confirmed": 0, "applied": 0})
        total = _quantity_total(quantities)
        if total is not None or not quantities or any(category not in quantities for category in CATEGORIES):
            last_saved[(str(owner_id), str(item_id), scope_key)] = (unit, total)
    for (owner_id, _, _), (unit, total) in last_saved.items():
        quantities = groups[owner_id]["quantities"][unit]
        quantities["surveyed"] = (quantities["surveyed"] + total
                                  if quantities["surveyed"] is not None and total is not None else None)
    for entry in entries:
        owner_id = entry.get("owner_id")
        state = entry["classification"]
        if not owner_id or state == "PENDING_UNADMITTED":
            continue
        group = groups.setdefault(str(owner_id), {"name": entry["owner_name"], "surveyed": set(), "confirmed": set(), "applied": set(), "quantities": {}})
        item_id = entry["item_id"]
        group["surveyed"].add(item_id)
        raw_unit = entry.get("unit")
        fallback = target_units.get((item_id, entry.get("scope_id")))
        if fallback is None and len(item_units[item_id]) == 1:
            fallback = next(iter(item_units[item_id]))
        unit = _quantity_unit(raw_unit) if raw_unit and raw_unit.strip() else fallback or _quantity_unit(None)
        quantities = group["quantities"].setdefault(unit, {"unit": unit, "surveyed": 0, "confirmed": 0, "applied": 0})
        total = _quantity_total(entry.get("quantities"))
        if state in {"SELECTED_APPLY", "CONFIRMED_EXCLUDED", "ALREADY_APPLIED"}:
            group["confirmed"].add(item_id)
            quantities["confirmed"] = (quantities["confirmed"] + total
                                       if quantities["confirmed"] is not None and total is not None else None)
        if state == "ALREADY_APPLIED" or (project_selected and state == "SELECTED_APPLY"):
            group["applied"].add(item_id)
            quantities["applied"] = (quantities["applied"] + total
                                     if quantities["applied"] is not None and total is not None else None)
    rows = [{"owner_id": owner_id, "owner_name": group["name"],
             **{stage: len(group[stage]) for stage in ("surveyed", "confirmed", "applied")},
             "quantities_by_unit": [group["quantities"][unit] for unit in sorted(group["quantities"])]}
            for owner_id, group in groups.items()]
    return sorted(rows, key=lambda row: (-row["surveyed"], -row["confirmed"], -row["applied"], row["owner_name"], row["owner_id"]))


def snapshot(db: Session, round_id: uuid.UUID, selected_ids: set[str]) -> dict:
    """Capture one caller-consistent, read-only report for the frozen round denominator."""
    with db.no_autoflush:
        pairs = (db.query(StocktakeTarget, StocktakeCount)
                 .join(StocktakeTargetSet, StocktakeTarget.set_id == StocktakeTargetSet.set_id)
                 .outerjoin(StocktakeCount, StocktakeTarget.latest_count_id == StocktakeCount.count_id)
                 .filter(StocktakeTargetSet.round_id == round_id)
                 .order_by(StocktakeTarget.target_id).all())
        targets = [target for target, _ in pairs]
        figures = _figures(db, targets)
        entries = []
        for target, count in pairs:
            classification = _classification(count, selected_ids)
            held_reasons = []
            held_details = []
            current = figures[(target.item_id, target.scope_key)]
            if count and count.status == "CONFIRMED":
                if not current["pool_consistent"]:
                    held_reasons.append("POOL_MISMATCH")
                if any(count.quantities[category] < current["reservations"][category] for category in CATEGORIES):
                    held_reasons.append("RESERVATION_SHORTAGE")
                    held_details.extend({"code": "RESERVATION_SHORTAGE", "category": category,
                        "counted": count.quantities[category], "reserved": current["reservations"][category]}
                        for category in CATEGORIES if count.quantities[category] < current["reservations"][category])
            entries.append({"target_id": str(target.target_id), "item_id": str(target.item_id), "scope_id": target.scope_key,
                            "item_code": target.item_code, "item_name": target.item_name, "unit": target.unit,
                            "scope_name": target.scope_name, "count_id": str(count.count_id) if count else None,
                            "status": count.status if count else "UNCOUNTED", "version": count.version if count else 0,
                            "owner_id": str(count.owner_id) if count else None, "owner_name": count.owner_name if count else None,
                            "confirmation_revision_id": str(count.confirmation_revision_id) if count and count.confirmation_revision_id else None,
                            "quantities": count.quantities if count else None, "classification": classification,
                            "reservations": current["reservations"], "held_reasons": held_reasons,
                            "held_details": held_details})
        admitted = {(target.item_id, target.scope_key) for target in targets}
        for pending in db.query(StocktakePendingTarget).filter_by(round_id=round_id).order_by(
                StocktakePendingTarget.item_id, StocktakePendingTarget.scope_key).all():
            if (pending.item_id, pending.scope_key) in admitted:
                continue
            frozen = pending.snapshot
            entries.append({"target_id": None, "item_id": str(pending.item_id), "scope_id": pending.scope_key,
                            "item_code": frozen.get("item_code"), "item_name": frozen.get("item_name"),
                            "unit": frozen.get("unit"), "scope_name": frozen.get("scope_name"),
                            "count_id": None, "status": "PENDING_UNADMITTED", "version": 0, "owner_id": None,
                            "owner_name": None, "confirmation_revision_id": None, "quantities": None,
                            "classification": "PENDING_UNADMITTED", "reservations": None,
                            "held_reasons": [], "held_details": []})
    by_scope = []
    for scope_id in sorted({entry["scope_id"] for entry in entries}):
        group = [entry for entry in entries if entry["scope_id"] == scope_id]
        by_scope.append({"scope_id": scope_id, "scope_name": group[0]["scope_name"], **_totals(group)})
    by_employee = []
    for owner_id in sorted({entry["owner_id"] for entry in entries if entry["owner_id"]}):
        group = [entry for entry in entries if entry["owner_id"] == owner_id]
        by_employee.append({"owner_id": owner_id, "owner_name": group[0]["owner_name"], **_totals(group)})
    return {"entries": entries, "summary": _totals(entries), "item_summary": item_totals(entries), "by_scope": by_scope, "by_employee": by_employee}
