"""공통 재고 작업 원장 모델 계약."""

from __future__ import annotations

from sqlalchemy import UniqueConstraint

import app.models as models


def _unique_column_sets(table) -> set[tuple[str, ...]]:
    return {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }


def test_operation_models_are_exported_and_transaction_logs_link_reversals() -> None:
    assert hasattr(models, "InventoryOperation")
    assert hasattr(models, "InventoryOperationEffect")
    assert hasattr(models, "DefectInventoryMovement")

    operation_columns = set(models.InventoryOperation.__table__.columns.keys())
    assert {
        "operation_id",
        "kind",
        "domain",
        "action",
        "status",
        "display_label",
        "actor_employee_id",
        "actor_name",
        "department",
        "reason",
        "idempotency_key",
        "effective_at",
        "contract_version",
        "reverses_operation_id",
    } <= operation_columns
    assert ("reverses_operation_id",) in _unique_column_sets(
        models.InventoryOperation.__table__
    )
    assert ("idempotency_key",) in _unique_column_sets(
        models.InventoryOperation.__table__
    )

    transaction_columns = set(models.TransactionLog.__table__.columns.keys())
    assert {"operation_id", "operation_role", "reverses_log_id"} <= transaction_columns
    assert ("reverses_log_id",) in _unique_column_sets(models.TransactionLog.__table__)


def test_operation_effect_and_defect_movement_keep_append_only_reversal_links() -> None:
    effect_columns = set(models.InventoryOperationEffect.__table__.columns.keys())
    assert {
        "effect_id",
        "operation_id",
        "effect_kind",
        "subject_type",
        "subject_id",
        "role",
        "before_state",
        "after_state",
        "reverses_effect_id",
    } <= effect_columns
    assert ("reverses_effect_id",) in _unique_column_sets(
        models.InventoryOperationEffect.__table__
    )

    movement_columns = set(models.DefectInventoryMovement.__table__.columns.keys())
    assert {
        "movement_id",
        "operation_id",
        "record_id",
        "item_id",
        "department",
        "movement_type",
        "quantity_delta",
        "role",
        "actor_employee_id",
        "actor_name",
        "effective_at",
        "reverses_movement_id",
    } <= movement_columns
    assert ("reverses_movement_id",) in _unique_column_sets(
        models.DefectInventoryMovement.__table__
    )
