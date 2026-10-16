"""PostgreSQL CHECK deparsing must not hide changed values or precedence."""

import pytest
import sqlalchemy as sa

from app.models import Base
from bootstrap.schema import _postgres_check_matches


def _matches(table_name: str, constraint_name: str, actual: str) -> bool:
    """Compare an observed expression with the real model contract."""
    table = Base.metadata.tables[table_name]
    expected = next(c.sqltext for c in table.constraints
                    if isinstance(c, sa.CheckConstraint) and c.name == constraint_name)
    return _postgres_check_matches(table, expected, actual)


@pytest.mark.parametrize("actual, equivalent", [
    ("delta <> 0", True), ("delta != 0", True),
    ("delta = 0", False), ("delta <> 1", False),
])
def test_nonzero_operator_equivalence(actual: str, equivalent: bool) -> None:
    assert _matches("defect_stock_movements", "ck_defect_pool_movement_nonzero", actual) is equivalent


@pytest.mark.parametrize("actual, equivalent", [
    ("(observation_epoch_after = (observation_epoch_before + 1)) AND (observation_epoch_before >= 0)", True),
    ("observation_epoch_after = (observation_epoch_before + 2) AND observation_epoch_before >= 0", False),
    ("observation_epoch_after = (observation_epoch_before - 1) AND observation_epoch_before >= 0", False),
    ("observation_epoch_after = (observation_epoch_before + 1) OR observation_epoch_before >= 0", False),
    ("observation_epoch_after = (observation_epoch_before + 1) AND observation_epoch_before > 0", False),
])
def test_epoch_arithmetic_keeps_increment_and_conjunction(actual: str, equivalent: bool) -> None:
    assert _matches("stocktake_application_lines", "ck_stocktake_application_epoch", actual) is equivalent


@pytest.mark.parametrize("actual, equivalent", [
    ("((source_kind)::text = ANY ((ARRAY['transaction'::character varying, 'pool_movement'::character varying])::text[])) AND (observation_epoch >= 0)", True),
    ("(source_kind::text = ANY (ARRAY['transaction'::character varying::text, 'pool_movement'::character varying::text])) AND observation_epoch >= 0", True),
    ("source_kind IN ('transaction','pool_movement') OR observation_epoch >= 0", False),
    ("source_kind NOT IN ('transaction','pool_movement') AND observation_epoch >= 0", False),
    ("source_kind IN ('transaction','pool_movement') AND observation_epoch > 0", False),
    ("source_kind IN ('transaction','pool_movements') AND observation_epoch >= 0", False),
    ("(source_kind IN ('transaction','pool_movement') OR observation_epoch >= 0) AND observation_epoch >= 0", False),
])
def test_compound_membership_keeps_values_operator_and_precedence(actual: str, equivalent: bool) -> None:
    assert _matches("stocktake_effect_epochs", "ck_stocktake_effect_epoch", actual) is equivalent


def test_operator_normalization_preserves_quoted_literals() -> None:
    table = Base.metadata.tables["stocktake_effect_epochs"]
    assert not _postgres_check_matches(table, "source_kind = '!='", "source_kind = '<>'")
