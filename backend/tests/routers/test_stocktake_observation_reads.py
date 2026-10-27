"""Observation membership reads scale with observed items, not the item catalog."""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import event
from sqlalchemy.engine import Result
from sqlalchemy.orm import ORMExecuteState, Session

from app.models import Item
from app.services.stocktake_history import observation_groups
from tests.services.test_stocktake_application import apply, confirm, preview
from tests.services.test_stocktake_counts import setup_round


@contextmanager
def _item_id_reads(db: Session) -> Iterator[list[UUID]]:
    """Record actual scalar Item IDs returned by SQL without changing its results."""
    item_ids: list[UUID] = []

    def record(state: ORMExecuteState) -> Result[Any] | None:
        """Freeze only the membership projection, then return an equivalent result."""
        if not state.is_select:
            return None
        columns = state.statement.column_descriptions
        if len(columns) != 1 or columns[0]["expr"] is not Item.item_id:
            return None
        frozen = state.invoke_statement().freeze()
        item_ids.extend(row[0] for row in frozen.data)
        return frozen()

    event.listen(db, "do_orm_execute", record, retval=True)
    try:
        yield item_ids
    finally:
        event.remove(db, "do_orm_execute", record)


def test_empty_observation_history_never_reads_catalog_membership(
    db_session: Session, make_item: Callable[..., Item],
) -> None:
    for index in range(3):
        make_item(name=f"Unobserved {index}")
    db_session.commit()
    db_session.expunge_all()

    with _item_id_reads(db_session) as item_ids:
        groups = observation_groups(db_session)

    assert groups == []
    assert item_ids == [], "empty observation history scanned unrelated item IDs"


@pytest.mark.parametrize("search", [None, "Counted", "no such observation"])
def test_observation_membership_reads_only_observed_items(
    db_session: Session, make_item: Callable[..., Item], search: str | None,
) -> None:
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, count))
    observed_id = env[2].item_id
    expected = [group.model_dump(mode="json") for group in observation_groups(db_session, search=search)]
    for index in range(3):
        make_item(name=f"Unobserved {index}")
    db_session.commit()
    db_session.expunge_all()

    with _item_id_reads(db_session) as item_ids:
        groups = observation_groups(db_session, search=search)

    assert [group.model_dump(mode="json") for group in groups] == expected
    assert item_ids == [observed_id], "observation membership read unrelated catalog entries"
