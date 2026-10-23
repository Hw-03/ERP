"""Public work contracts carry pause metadata and explicit resume tokens."""
import uuid

from app.schemas.io import IoBatchResponse, IoDraftUpsert
from app.schemas.stock_request import StockRequestDraftUpsert, StockRequestResponse
from app.schemas.work_drafts import WorkDraftDetail, WorkDraftSummary


def test_saved_work_responses_default_to_unpaused() -> None:
    for schema in (IoBatchResponse, StockRequestResponse, WorkDraftSummary, WorkDraftDetail):
        assert "stocktake_pause" in schema.model_fields, f"{schema.__name__} must expose paused work"
        assert schema.model_fields["stocktake_pause"].default is None


def test_both_draft_upserts_accept_explicit_resume_tokens() -> None:
    token = uuid.uuid4()
    owner_id = uuid.uuid4()
    for schema, fields in (
        (IoDraftUpsert, {"work_type": "warehouse_io", "sub_type": "warehouse_to_dept"}),
        (StockRequestDraftUpsert, {"request_type": "raw_receive"}),
    ):
        payload = schema.model_validate({"requester_employee_id": owner_id, **fields, "stocktake_resume_token": str(token)})
        assert getattr(payload, "stocktake_resume_token", None) == token
