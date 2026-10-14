"""Prepare full close evidence outside the bounded, exclusive final transaction."""
from collections import defaultdict
from copy import deepcopy
from datetime import datetime
import uuid

from sqlalchemy.orm import Session

from app.models import (Employee, Inventory, StocktakeCloseChunk, StocktakeCloseCommit,
                        StocktakeCloseManifest, StocktakeCloseSeal, StocktakeProgress,
                        StocktakeReceipt, StocktakeRound)
from app.services import defect_pool, stocktake_application, stocktake_guard
from app.services.inventory_conflicts import InventoryConflict
from app.services.realtime import suppress_realtime_revision
from app.services.stocktake_common import active_round, append_event, fingerprint, open_preview, require_round_manager, seal

CHUNK_SIZE = 100
MAX_SCOPES = 3
MAX_CLOSE_TARGETS = 10
MAX_CLOSE_EFFECTS = 40


def revision_vector(db: Session, round_id: uuid.UUID) -> dict:
    """Compare the entire scope key set as well as every progress revision."""
    row = db.query(StocktakeRound).filter_by(round_id=round_id).populate_existing().one()
    progress = db.query(StocktakeProgress.scope_key, StocktakeProgress.progress_revision).filter_by(round_id=round_id).all()
    return {"epoch": row.epoch, "target_generation": row.target_generation,
            "progress": {key: version for key, version in sorted(progress)}}


def selected_manifests(db: Session, round_id: uuid.UUID, ids: list[str], *, lock: bool) -> tuple[list, list[dict]]:
    """Declare all items once and validate totals across all selected locations."""
    if not ids:
        return [], []
    if len(ids) > MAX_CLOSE_TARGETS:
        raise InventoryConflict("SCALE_LIMIT", "종료와 함께 최대 10개 확인 결과를 반영할 수 있습니다. 위치별 사전 반영을 진행해 주세요.", status_code=422)
    rows = stocktake_application.selected_rows(db, round_id, ids, lock=lock, max_scopes=MAX_SCOPES)
    by_scope = defaultdict(list)
    for row in rows:
        by_scope[row[0].scope_key].append(row)
    groups = [by_scope[key] for key in sorted(by_scope)]
    manifests = [stocktake_application.manifest(db, round_id, group, lock=lock) for group in groups]
    if sum(value["effect_count"] for value in manifests) > MAX_CLOSE_EFFECTS:
        raise InventoryConflict("SCALE_LIMIT", "종료와 함께 반영할 효과는 최대 40개입니다. 위치별 사전 반영을 진행해 주세요.", status_code=422)
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


def _verify_chunks(db: Session, row: StocktakeCloseManifest) -> None:
    """Validate complete immutable chunks before publishing the preview seal."""
    chunks = db.query(StocktakeCloseChunk).filter_by(manifest_id=row.manifest_id).order_by(StocktakeCloseChunk.chunk_index).all()
    hashes = [chunk.chunk_hash for chunk in chunks]
    valid = (len(chunks) == row.chunk_count and sum(len(chunk.entries) for chunk in chunks) == row.row_count
             and fingerprint(hashes) == row.header["entries_hash"]
             and all(chunk.chunk_index == index and 0 < len(chunk.entries) <= CHUNK_SIZE
                     and chunk.chunk_hash == fingerprint(chunk.entries) for index, chunk in enumerate(chunks)))
    if not valid:
        raise InventoryConflict("PREVIEW_STALE", "종료 증빙이 완전히 준비되지 않았습니다. 다시 생성해 주세요.")


def prepare(db: Session, actor: Employee, key: str, payload: dict, request_hash: str) -> dict:
    """Read one snapshot, persist short chunks, then publish one receipt and seal.

    The HTTP dependency starts a read-only repeatable snapshot before authentication.
    A failed preparation can leave invisible unsealed evidence, never business effects.
    """
    from app.services import stocktake, stocktake_reports
    from app.services.stocktake_common import receipt_response

    require_round_manager(actor)
    actor_id = actor.employee_id
    existing = db.query(StocktakeReceipt).filter_by(actor_id=actor_id, command_kind="round_close_preview", idempotency_key=key).one_or_none()
    if existing is not None and existing.response is not None:
        if existing.request_hash != request_hash:
            raise InventoryConflict("IDEMPOTENCY_CONFLICT", "동일한 키에 다른 요청이 사용되었습니다.")
        result = receipt_response(existing)
        db.rollback()
        return result
    round_id = uuid.UUID(payload["round_id"])
    active_round(db, round_id)
    vector = revision_vector(db, round_id)
    _, applications = selected_manifests(db, round_id, payload["confirmation_revision_ids"], lock=False)
    snapshot = stocktake_reports.snapshot(db, round_id, set(payload["confirmation_revision_ids"]))
    entries = snapshot.pop("entries")
    snapshot["projected_item_summary"] = stocktake_reports.item_totals(entries, project_selected=True)
    chunks = [entries[offset:offset + CHUNK_SIZE] for offset in range(0, len(entries), CHUNK_SIZE)]
    header = {**payload, **snapshot, "vector": vector, "applications": applications,
              "entries_hash": fingerprint([fingerprint(chunk) for chunk in chunks])}
    manifest_id = uuid.uuid4()
    reader_bind = db.get_bind()
    db.rollback()
    # Only the request dependency may supply a writer bound to the exact same DB.
    if "stocktake_preview_writer" in db.info:
        db.bind = db.info["stocktake_preview_writer"]
    manifest_row = StocktakeCloseManifest(manifest_id=manifest_id, round_id=round_id, header=header,
        manifest_hash=fingerprint(header), chunk_count=len(chunks), row_count=len(entries))
    with suppress_realtime_revision(db):
        db.add(manifest_row)
        db.commit()
        for index, chunk in enumerate(chunks):
            db.add(StocktakeCloseChunk(manifest_id=manifest_id, chunk_index=index, entries=chunk, chunk_hash=fingerprint(chunk)))
            db.commit()
        db.bind = reader_bind
        manifest_row = db.get(StocktakeCloseManifest, manifest_id)
        _verify_chunks(db, manifest_row)
        # Finish the long read before the short sealing transaction.
        db.rollback()
        if "stocktake_preview_writer" in db.info:
            db.bind = db.info["stocktake_preview_writer"]
        stocktake_guard.lock_control(db)
        actor = db.get(Employee, actor_id)
        if actor is None or not actor.is_active:
            raise InventoryConflict("OPERATOR_SESSION_INVALID", "활성 작업자로 다시 인증해 주세요.", status_code=401)
        require_round_manager(actor)
        active_round(db, round_id)
        if revision_vector(db, round_id) != vector:
            raise InventoryConflict("PREVIEW_STALE", "증빙 준비 중 조사 상태가 변경되었습니다. 다시 미리보기를 생성해 주세요.")
        receipt = stocktake.claim_receipt(db, actor_id, "round_close_preview", key, request_hash)
        if receipt.response is not None:
            result = receipt_response(receipt)
            db.rollback()
            return result
        refs = []
        for application in applications:
            app_preview = seal(db, actor, "application", application, round_id)
            refs.append({"scope_id": application["scope_id"], "preview_id": str(app_preview.preview_id), "preview_hash": app_preview.preview_hash})
        preview = seal(db, actor, "round_close", {"manifest_id": str(manifest_id),
            "manifest_hash": fingerprint(header), "application_previews": refs}, round_id)
        db.add(StocktakeCloseSeal(manifest_id=manifest_id, preview_id=preview.preview_id))
        receipt.response = {"preview_id": str(preview.preview_id), "preview_hash": preview.preview_hash,
            "expires_at": preview.expires_at.isoformat() + "Z", "round_id": str(round_id), "manifest_id": str(manifest_id),
            "summary": header["summary"], "item_summary": header["item_summary"], "mode": header["mode"], "reason": header["reason"],
            "can_close": _can_close(header), "receipt_id": str(receipt.receipt_id)}
        receipt.completed_at = datetime.utcnow()
        result = dict(receipt.response)
        db.commit()
        return result


def _can_close(header: dict) -> bool:
    """Partial closure tolerates explicit exclusions, never a held selected apply."""
    if not all(application["can_apply"] for application in header["applications"]):
        return False
    summary = header["summary"]
    return header["mode"] == "PARTIAL" or (summary["applied"] + summary["selected"] == summary["total"] and summary["pending"] == 0)


def projected_report(header: dict) -> dict:
    """Preserve the pre-close confirmation denominator and project only explicit applies."""
    report = {key: deepcopy(header[key]) for key in ("summary", "by_scope", "by_employee")}
    if "projected_item_summary" in header:
        report["item_summary"] = deepcopy(header["projected_item_summary"])
    report["summary"]["applied"] += report["summary"]["selected"]
    for key in ("by_scope", "by_employee"):
        for value in report[key]:
            value["applied"] += value.get("selected", 0)
    return report


def close(db: Session, actor: Employee, payload: dict, receipt_id: uuid.UUID) -> dict:
    """Only bounded selected rows and round/control pointers are changed atomically."""
    require_round_manager(actor)
    round_id = uuid.UUID(payload["round_id"])
    row = active_round(db, round_id)
    preview = open_preview(db, payload, "round_close")
    if preview.round_id != round_id:
        raise InventoryConflict("PREVIEW_STALE", "다른 회차의 종료 미리보기입니다.")
    manifest_id = uuid.UUID(preview.payload["manifest_id"])
    manifest_row = db.get(StocktakeCloseManifest, manifest_id)
    published = db.get(StocktakeCloseSeal, manifest_id)
    if (manifest_row is None or published is None or published.preview_id != preview.preview_id
            or manifest_row.round_id != round_id or manifest_row.manifest_hash != preview.payload["manifest_hash"]):
        raise InventoryConflict("PREVIEW_STALE", "봉인된 종료 증빙이 아닙니다.")
    header = manifest_row.header
    if revision_vector(db, round_id) != header["vector"]:
        raise InventoryConflict("PREVIEW_STALE", "확인·예약·조사 대상이 변경되었습니다. 다시 미리보기를 확인해 주세요.")
    groups, applications = selected_manifests(db, round_id, header["confirmation_revision_ids"], lock=True)
    if fingerprint(applications) != fingerprint(header["applications"]):
        raise InventoryConflict("PREVIEW_STALE", "선택 반영 수량 또는 예약이 변경되었습니다.")
    if not _can_close(header):
        raise InventoryConflict("STOCKTAKE_APPLY_HELD", "미반영·미편입 대상 또는 선택 반영 보류가 남아 있습니다.", status_code=422,
                                extra={"summary": header["summary"]})
    prepared = []
    cells = []
    for group, application, ref in zip(groups, applications, preview.payload["application_previews"]):
        derived_key = uuid.uuid5(receipt_id, application["scope_id"])
        evidence, operation = stocktake_application.begin_application(db, actor, application, uuid.UUID(ref["preview_id"]), derived_key)
        prepared.append((evidence, group, application))
        cells.extend((cell, entry, evidence, operation) for cell, entry in zip(group, application["entries"]))
    # A valid final total must never overflow a PostgreSQL integer on the way there.
    # All leaf locks were acquired before this per-item reduction-first traversal.
    for cell, entry, evidence, operation in sorted(cells, key=lambda value: (
            value[1]["item_id"], sum(value[1]["deltas"].values()), value[1]["scope_id"])):
        stocktake_application.apply_cell(db, actor, cell, entry, evidence, operation)
    applied = [stocktake_application.application_response(evidence, group, application) for evidence, group, application in prepared]
    row.status = "CLOSED_FULL" if header["mode"] == "FULL" else "CLOSED_PARTIAL"
    row.closed_at = datetime.utcnow()
    control = db.info[stocktake_guard.STATE_KEY]["control"]
    control.active_round_id = None
    control.epoch += 1
    db.add(StocktakeCloseCommit(round_id=round_id, manifest_id=manifest_id, actor_id=actor.employee_id,
        actor_name=actor.name, applications=applied))
    append_event(db, actor, round_id, "ROUND_CLOSED", {"manifest_id": str(manifest_id), "status": row.status,
        "reason": header["reason"], "invalidated_epoch": row.epoch, "next_epoch": control.epoch})
    return {"round_id": str(round_id), "status": row.status, "manifest_id": str(manifest_id),
            "applications": applied, **projected_report(header)}
