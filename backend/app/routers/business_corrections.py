"""Operator requests and administrator decisions share the durable command boundary."""
import uuid

from fastapi import APIRouter, Query, Request

from app.models import BusinessCorrection, BusinessCorrectionEvent
from app.routers.stocktakes import Admin, Database, Key, Operator, _execute
from app.schemas import business_correction as schema
from app.services.business_corrections import response
from app.services.inventory_conflicts import InventoryConflict

router = APIRouter()


def _row(db: Database, correction_id: uuid.UUID) -> BusinessCorrection:
    """Keep missing records distinct from an empty review history."""
    row = db.get(BusinessCorrection, correction_id)
    if row is None:
        raise InventoryConflict("NOT_FOUND", "업무 정정 요청을 찾을 수 없습니다.", status_code=404)
    return row


@router.get("")
def corrections(db: Database, operator: Operator, limit: int = Query(50, ge=1, le=200)) -> dict:
    """Return recent requests including terminal decisions."""
    rows = db.query(BusinessCorrection).order_by(BusinessCorrection.created_at.desc(), BusinessCorrection.correction_id).limit(limit).all()
    return {"items": [response(row) for row in rows]}


@router.post("")
def request_correction(payload: schema.CorrectionRequest, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Original workflow authority is checked again inside the service."""
    return _execute(request, db, operator[0], "correction_request", key, payload.model_dump(mode="json"))


@router.get("/{correction_id}")
def detail(correction_id: uuid.UUID, db: Database, operator: Operator) -> dict:
    """Expose the frozen original group for an informed decision."""
    row = _row(db, correction_id)
    return {**response(row), "scope": row.scope}


@router.get("/{correction_id}/events")
def events(correction_id: uuid.UUID, db: Database, operator: Operator) -> dict:
    """Return immutable request and decision evidence with the verified actor."""
    _row(db, correction_id)
    rows = db.query(BusinessCorrectionEvent).filter_by(correction_id=correction_id).order_by(BusinessCorrectionEvent.created_at, BusinessCorrectionEvent.event_id).all()
    return {"items": [{"event_id": str(row.event_id), "kind": row.kind, "actor_id": str(row.actor_id),
                       "actor_name": row.actor_name, "created_at": row.created_at.isoformat(), "payload": row.payload} for row in rows]}


@router.post("/{correction_id}/previews")
def preview(correction_id: uuid.UUID, payload: schema.CorrectionVersionBody, request: Request, db: Database, actor: Admin, key: Key) -> dict:
    """Approval uses current physical stock and reservations, never old quantities."""
    return _execute(request, db, actor, "correction_preview", key, {"correction_id": str(correction_id), **payload.model_dump(mode="json")})


@router.post("/{correction_id}/approve")
def approve(correction_id: uuid.UUID, payload: schema.CorrectionApproveBody, request: Request, db: Database, actor: Admin, key: Key) -> dict:
    """Require a fresh PIN and the unchanged complete preview."""
    return _execute(request, db, actor, "correction_approve", key, {"correction_id": str(correction_id), **payload.model_dump(mode="json")})


@router.post("/{correction_id}/reject")
def reject(correction_id: uuid.UUID, payload: schema.CorrectionDecisionBody, request: Request, db: Database, actor: Admin, key: Key) -> dict:
    """Rejection records its reason without changing the original workflow."""
    return _execute(request, db, actor, "correction_reject", key, {"correction_id": str(correction_id), **payload.model_dump(mode="json")})


@router.post("/{correction_id}/withdraw")
def withdraw(correction_id: uuid.UUID, payload: schema.CorrectionDecisionBody, request: Request, db: Database, operator: Operator, key: Key) -> dict:
    """Only the original requester can withdraw an undecided request."""
    return _execute(request, db, operator[0], "correction_withdraw", key, {"correction_id": str(correction_id), **payload.model_dump(mode="json")})
