"""Only active work pauses live in a separate table from preserved drafts."""
from sqlalchemy import CheckConstraint

from app import models


def test_pause_model_has_independent_composite_identity_and_round_fence() -> None:
    assert hasattr(models, "StocktakeWorkPause"), "Active work pauses need their own model"
    table = models.StocktakeWorkPause.__table__
    assert [column.name for column in table.primary_key] == ["kind", "work_id"]
    assert set(table.columns.keys()) == {"kind", "work_id", "round_id", "token", "required_cells", "paused_at"}
    foreign_key = next(iter(table.c.round_id.foreign_keys))
    assert foreign_key.target_fullname == "stocktake_rounds.round_id"
    assert foreign_key.ondelete == "RESTRICT"
    assert all(not column.nullable for column in table.columns)
    checks = [str(constraint.sqltext) for constraint in table.constraints if isinstance(constraint, CheckConstraint)]
    assert "kind IN ('io', 'stock_request')" in checks
