"""Department routing must not upgrade the stock fence against concurrent draft FKs."""
from concurrent.futures import ThreadPoolExecutor
import uuid

from sqlalchemy import text

from app import models as m
from app.services.inv_transfer import lock_items_for_department_routing
from tests.concurrency.test_work_stocktake_pause_postgres import Factory, cloned_pg  # noqa: F401


def test_clone_routing_allows_uncommitted_draft_item_reference(cloned_pg: Factory) -> None:
    """A second draft's FK lock cannot stop routing while its parent writer is fenced."""
    with cloned_pg() as holder:
        batch = holder.query(m.IoBatch).filter_by(status="draft").order_by(m.IoBatch.batch_id).first()
        item = holder.query(m.Item).filter(m.Item.process_type_code == "AR", m.Item.deleted_at.is_(None)).order_by(m.Item.item_id).first()
        assert batch is not None and item is not None
        item_id = item.item_id
        holder_pid = holder.execute(text("SELECT pg_backend_pid()")).scalar_one()
        # This actual child INSERT obtains Item KEY SHARE, without changing stock.
        holder.add(m.IoBundle(bundle_id=uuid.uuid4(), batch_id=batch.batch_id,
            source_kind="item", source_item_id=item_id, title_snapshot="Clone routing race", quantity=1))
        holder.flush()

        def route() -> tuple[int, bool]:
            with cloned_pg() as db:
                pid = db.execute(text("SELECT pg_backend_pid()")).scalar_one()
                db.execute(text("SET lock_timeout = '1s'"))
                db.execute(text("SET statement_timeout = '5s'"))
                items = lock_items_for_department_routing(db, [item_id])
                db.commit()
                return pid, item_id in items

        try:
            with ThreadPoolExecutor(max_workers=1) as pool:
                routing_pid, found = pool.submit(route).result(timeout=10)
            assert routing_pid != holder_pid and found
            assert holder.in_transaction(), "The FK holder must still be uncommitted"
        finally:
            holder.rollback()
