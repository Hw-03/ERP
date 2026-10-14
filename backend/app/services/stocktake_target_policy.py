"""Persist target membership rules in the sealed start manifest, without rewriting rounds."""
import uuid

from sqlalchemy import case
from sqlalchemy.orm import Session

from app.models import StocktakePreview, StocktakeTargetSet

LEGACY_POLICY = "ALL_ACTIVE_LOCATIONS"
CODE_POLICY = "CODE_AND_WAREHOUSE"
DASHBOARD_POLICY = "DASHBOARD_CODE_AND_WAREHOUSE_V1"
PROCESS_DEPARTMENTS = {"T": "튜브", "H": "고압", "V": "진공", "N": "튜닝", "A": "조립", "P": "출하"}


def dashboard_item_eligible(code: str | None, deleted: bool, item_type: str | None) -> bool:
    """Match the default dashboard KPI scope, independently of physical quantities."""
    normalized = (code or "").upper()
    return not deleted and item_type != "불용" and "-PA-" not in normalized and "-PF-" not in normalized


def code_department(code: str | None) -> str | None:
    """Match the dashboard's supported two-letter process codes, without guessing a location."""
    parts = (code or "").split("-")
    process = parts[1] if len(parts) >= 2 else ""
    return PROCESS_DEPARTMENTS.get(process[:1]) if len(process) == 2 and process[1] in "RAF" else None


def code_department_expression(code: object) -> object:
    """Use the frozen item code to classify each admitted target in SQL."""
    return case(*[(code.like(f"%-{prefix}{suffix}-%"), name)
                  for prefix, name in PROCESS_DEPARTMENTS.items() for suffix in "RAF"], else_=None)


def round_policy(db: Session, round_id: uuid.UUID) -> str:
    """The first activated set fixes policy; old manifests deliberately keep legacy behavior."""
    preview = db.query(StocktakePreview).join(
        StocktakeTargetSet, StocktakeTargetSet.preview_id == StocktakePreview.preview_id,
    ).filter(StocktakeTargetSet.round_id == round_id).order_by(
        StocktakeTargetSet.activated_at, StocktakeTargetSet.set_id,
    ).first()
    return preview.payload.get("target_policy", LEGACY_POLICY) if preview else LEGACY_POLICY
