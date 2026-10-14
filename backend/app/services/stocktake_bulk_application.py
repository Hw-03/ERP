"""One owned selection, atomic across scopes, with existing per-scope evidence."""
from collections import defaultdict
import uuid

from sqlalchemy.orm import Session

from app.models import Employee, Inventory, StocktakeTarget
from app.services import defect_pool, stocktake_application, stocktake_targets
from app.services.inventory_conflicts import InventoryConflict
from app.services.stocktake_common import active_round, fingerprint, open_preview, seal


def selected_manifests(db: Session, actor: Employee, round_id: uuid.UUID,
                       ids: list[str]) -> tuple[list[list[tuple]], list[dict]]:
    """Declare every item before leaves and validate final totals across scopes."""
    admitted = stocktake_targets.round_targets(db, round_id)
    rows = stocktake_application.selected_rows(db, round_id, ids, max_targets=admitted.count(),
        max_scopes=admitted.with_entities(StocktakeTarget.scope_key).distinct().count())
    stocktake_application.require_owned(actor, rows)
    by_scope = defaultdict(list)
    for row in rows:
        by_scope[row[0].scope_key].append(row)
    groups = [by_scope[key] for key in sorted(by_scope)]
    manifests = [stocktake_application.manifest(db, round_id, group, max_effects=None) for group in groups]
    deltas = defaultdict(int)
    for value in manifests:
        for entry in value["entries"]:
            deltas[entry["item_id"]] += sum(entry["deltas"].values())
    totals = {str(row.item_id): int(row.quantity) for row in db.query(Inventory).filter(
        Inventory.item_id.in_([uuid.UUID(key) for key in deltas])).all()}
    for value in manifests:
        for entry in value["entries"]:
            entry["held"] = [reason for reason in entry["held"] if reason["code"] != "TOTAL_OUT_OF_RANGE"]
            total = totals[entry["item_id"]] + deltas[entry["item_id"]]
            if not 0 <= total <= defect_pool.MAX_QUANTITY:
                entry["held"].append({"code": "TOTAL_OUT_OF_RANGE", "total_after": total})
        value["can_apply"] = not any(entry["held"] for entry in value["entries"])
    return groups, manifests


def execute(db: Session, actor: Employee, kind: str, payload: dict, receipt_id: uuid.UUID) -> dict:
    """Only the outer receipted command commits; a failed cell rolls back all scopes."""
    round_id = uuid.UUID(payload["round_id"])
    active_round(db, round_id)
    if kind == "application_bulk_preview":
        groups, manifests = selected_manifests(db, actor, round_id, payload["confirmation_revision_ids"])
        children = [seal(db, actor, "application_bulk_scope", value, round_id) for value in manifests]
        master = seal(db, actor, "application_bulk", {
            "applications": manifests,
            "scope_previews": [{"preview_id": str(child.preview_id), "preview_hash": child.preview_hash}
                               for child in children]}, round_id)
        # Internal child seals cannot be invoked as a normal application preview.
        return {"preview_id": str(master.preview_id), "preview_hash": master.preview_hash,
                "expires_at": master.expires_at.isoformat() + "Z",
                "entries": [{**entry, "item_name": row[0].item_name, "scope_name": row[0].scope_name}
                            for group, value in zip(groups, manifests)
                            for row, entry in zip(group, value["entries"])],
                "can_apply": all(value["can_apply"] for value in manifests)}

    master = open_preview(db, payload, "application_bulk")
    if master.actor_id != actor.employee_id:
        raise InventoryConflict("FORBIDDEN", "본인의 미리보기만 반영할 수 있습니다.", status_code=403)
    if master.round_id != round_id:
        raise InventoryConflict("PREVIEW_STALE", "다른 회차의 미리보기입니다.")
    prior = master.payload["applications"]
    ids = [entry["confirmation_revision_id"] for value in prior for entry in value["entries"]]
    groups, manifests = selected_manifests(db, actor, round_id, ids)
    if fingerprint(manifests) != fingerprint(prior):
        raise InventoryConflict("PREVIEW_STALE", "수량·예약·확인 버전이 변경되었습니다. 다시 검토해 주세요.")
    if not all(value["can_apply"] for value in manifests):
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "선택한 결과 중 반영할 수 없는 위치가 있습니다.", status_code=422,
                                extra={"entries": [entry for value in manifests for entry in value["entries"] if entry["held"]]})
    prepared, cells = [], []
    for group, value, ref in zip(groups, manifests, master.payload["scope_previews"]):
        child = open_preview(db, ref, "application_bulk_scope")
        if child.round_id != round_id or child.actor_id != actor.employee_id or fingerprint(value) != child.preview_hash:
            raise InventoryConflict("PREVIEW_STALE", "위치별 검토 증빙이 변경되었습니다.")
        application, operation = stocktake_application.begin_application(
            db, actor, value, child.preview_id, uuid.uuid5(receipt_id, value["scope_id"]))
        prepared.append((application, group, value))
        cells.extend((row, entry, application, operation) for row, entry in zip(group, value["entries"]))
    # A valid aggregate must not overflow an integer while moving between locations.
    for row, entry, application, operation in sorted(cells, key=lambda cell: (
            cell[1]["item_id"], sum(cell[1]["deltas"].values()), cell[1]["scope_id"])):
        stocktake_application.apply_cell(db, actor, row, entry, application, operation)
    return {"applications": [stocktake_application.application_response(application, group, value)
                             for application, group, value in prepared],
            "confirmation_revision_ids": ids}
