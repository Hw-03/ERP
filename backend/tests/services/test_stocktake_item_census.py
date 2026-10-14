"""Item KPIs never replace immutable location evidence or stock effects."""
import uuid
from collections.abc import Callable
from datetime import datetime
from sqlalchemy.orm import Session
import pytest

from app import models
from app.services import stocktake_reads, stocktake_reports, stocktake_targets
from app.services.stocktake_target_policy import CODE_POLICY, DASHBOARD_POLICY, round_policy
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_counts import setup_round, start_count
from tests.services.test_stocktake_application import confirm, preview, apply
from tests.services.test_stocktake_dashboard_reads import append_targets, pages


def location_env(db: Session, env: tuple, scope: str) -> tuple:
    """Reuse real count commands for the other admitted location."""
    rows = stocktake_reads.targets(db, uuid.UUID(env[3]['round_id']))['items']
    target = next(row for row in rows if row['item_id'] == str(env[2].item_id) and row['scope_id'] == scope)
    return (*env[:4], target)


def summary(db: Session, env: tuple) -> dict:
    """Read both denominators from the same consistent report."""
    return stocktake_reports.snapshot(db, uuid.UUID(env[3]['round_id']), set())


def test_new_round_matches_dashboard_scope_and_keeps_zero_inventory(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """Excluded stock survives while inventory-free catalog items are admitted."""
    env = setup_round(db_session, make_item, new_policy=True)
    for process in ('PA', 'PF'):
        if db_session.get(models.ProcessType, process) is None:
            db_session.add(models.ProcessType(code=process, prefix='P', suffix=process[1], stage_order=0))
            db_session.flush()
        make_item(name=process, process_type_code=process, warehouse_qty=5)
    disused = make_item(name='Disused', warehouse_qty=9)
    disused.legacy_item_type = '불용'
    deleted = make_item(name='Deleted', warehouse_qty=6)
    deleted.deleted_at = datetime.utcnow()
    zero = make_item(name='No inventory')
    db_session.query(models.Inventory).filter_by(item_id=zero.item_id).delete()
    db_session.commit()
    append_targets(db_session, env)
    assert round_policy(db_session, uuid.UUID(env[3]['round_id'])) == 'DASHBOARD_CODE_AND_WAREHOUSE_V1'
    result = pages(db_session, env, group_by_item=True, limit=1)
    assert {row['item_id'] for row in result} == {str(env[2].item_id), str(zero.item_id)}
    assert all(len(row['location_targets']) == 2 for row in result)
    assert summary(db_session, env)['item_summary'] == dict(total=2, unconfirmed=2, confirmed=0, applied=0)
    assert db_session.query(models.Inventory).filter_by(item_id=disused.item_id).one().warehouse_qty == 9


def test_item_confirmation_and_apply_require_every_location_and_recount_resets(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """Real location commands move an item KPI only after both locations finish."""
    env = setup_round(db_session, make_item, new_policy=True)
    warehouse = confirm(db_session, env)
    assert pages(db_session, env, group_by_item=True, status_group='CONFIRMED_WAITING', limit=1) == []
    assert summary(db_session, env)['summary']['confirmed'] == 1
    assert summary(db_session, env)['item_summary'] == dict(total=1, unconfirmed=1, confirmed=0, applied=0)
    tube_env = location_env(db_session, env, 'tube')
    tube = confirm(db_session, tube_env, normal=0)
    assert summary(db_session, env)['item_summary'] == dict(total=1, unconfirmed=0, confirmed=1, applied=0)
    apply(db_session, env, preview(db_session, env, warehouse))
    assert summary(db_session, env)['item_summary']['applied'] == 0
    apply(db_session, tube_env, preview(db_session, tube_env, tube))
    assert summary(db_session, env)['item_summary'] == dict(total=1, unconfirmed=0, confirmed=1, applied=1)
    start_count(db_session, location_env(db_session, env, 'tube'))
    assert summary(db_session, env)['item_summary'] == dict(total=1, unconfirmed=1, confirmed=0, applied=0)


def test_grouped_kpi_filters_all_locations_before_paging(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """Partial completion never leaks through a paged item status filter."""
    env = setup_round(db_session, make_item, new_policy=True)
    for index in range(6):
        make_item(name=f'Earlier uncounted {index}')
    db_session.commit()
    append_targets(db_session, env)
    warehouse = confirm(db_session, env)
    assert pages(db_session, env, group_by_item=True, status_group='CONFIRMED_ALL', limit=1) == []
    assert str(env[2].item_id) in {row['item_id'] for row in pages(db_session, env, group_by_item=True, status_group='UNCONFIRMED', limit=1)}
    assert pages(db_session, env, group_by_item=True, status='CONFIRMED', limit=1)[0]['scope_id'] == 'warehouse'
    apply(db_session, env, preview(db_session, env, warehouse))
    assert pages(db_session, env, group_by_item=True, status='APPLIED', limit=1) == []
    tube_env = location_env(db_session, env, 'tube')
    tube = confirm(db_session, tube_env, normal=0)
    assert len(pages(db_session, env, group_by_item=True, status_group='CONFIRMED_ALL', search='Counted', process_steps=['R'], logic='AND', limit=1)) == 1
    assert len(pages(db_session, env, group_by_item=True, status_group='CONFIRMED_WAITING', search='Counted', process_steps=['R'], logic='AND', limit=1)) == 1
    apply(db_session, tube_env, preview(db_session, tube_env, tube))
    assert len(pages(db_session, env, group_by_item=True, status='APPLIED', limit=1)) == 1
    assert pages(db_session, env, group_by_item=True, status_group='CONFIRMED_WAITING', limit=1) == []
    assert len(pages(db_session, env, status='APPLIED', limit=1)) == 2


def test_new_close_seals_item_summary_and_projects_selected_cells(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """Frozen item evidence projects selected applies without reading later catalog edits."""
    from app.services.stocktake_closing import projected_report
    env = setup_round(db_session, make_item, new_policy=True)
    counts = [confirm(db_session, env), confirm(db_session, location_env(db_session, env, 'tube'), normal=0)]
    proposal = env[0].execute(db_session, env[1], 'round_close_preview', str(uuid.uuid4()), {
        'round_id': env[3]['round_id'], 'mode': 'FULL', 'reason': 'Complete',
        'confirmation_revision_ids': [count['confirmation_revision_id'] for count in counts]})
    assert proposal['can_close']
    manifest = db_session.get(models.StocktakeCloseManifest, uuid.UUID(proposal['manifest_id']))
    assert manifest.header['item_summary'] == dict(total=1, unconfirmed=0, confirmed=1, applied=0)
    env[0].execute(db_session, env[1], 'round_close', str(uuid.uuid4()), {
        'round_id': env[3]['round_id'], 'preview_id': proposal['preview_id'], 'preview_hash': proposal['preview_hash']})
    assert projected_report(manifest.header)['item_summary'] == dict(total=1, unconfirmed=0, confirmed=1, applied=1)
    env[2].legacy_item_type = '불용'
    db_session.commit()
    assert projected_report(manifest.header)['item_summary']['total'] == 1


def test_existing_admitted_item_is_not_removed_on_catalog_edit(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """Eligibility changes never remove already admitted target identities."""
    env = setup_round(db_session, make_item, new_policy=True)
    env[2].legacy_item_type = '불용'
    db_session.commit()
    assert stocktake_targets.pending_rows(db_session, uuid.UUID(env[3]['round_id'])) == []
    assert len(pages(db_session, env, group_by_item=True)) == 1
    assert summary(db_session, env)['item_summary']['total'] == 1


def test_previous_code_policy_still_blocks_deleted_stock(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """The new exclusion rule must not rewrite the earlier policy contract."""
    setup_round(db_session, make_item, new_policy=True)
    deleted = make_item(name='Old policy residual', warehouse_qty=3)
    deleted.deleted_at = datetime.utcnow()
    db_session.commit()
    with pytest.raises(InventoryConflict) as conflict:
        stocktake_targets.candidate_rows(db_session, policy=CODE_POLICY)
    assert conflict.value.code == 'TARGET_SET_CHANGED'
    assert str(deleted.item_id) in {row['item_id'] for row in conflict.value.extra['items']}
    assert str(deleted.item_id) not in {row['item_id'] for row in stocktake_targets.candidate_rows(db_session, policy=DASHBOARD_POLICY)}


def test_excluded_item_becomes_pending_only_after_eligibility_changes(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """New eligibility requires explicit admission before the round denominator grows."""
    env = setup_round(db_session, make_item, new_policy=True)
    item = make_item(name='Eligible later')
    item.legacy_item_type = '불용'
    db_session.commit()
    round_id = uuid.UUID(env[3]['round_id'])
    assert stocktake_targets.pending_rows(db_session, round_id) == []
    item.legacy_item_type = None
    db_session.commit()
    pending = stocktake_targets.pending_rows(db_session, round_id)
    assert len(pending) == 2 and {row['item_id'] for row in pending} == {str(item.item_id)}
    assert summary(db_session, env)['item_summary']['total'] == 1
    append_targets(db_session, env)
    assert summary(db_session, env)['item_summary']['total'] == 2


def test_old_frozen_close_report_keeps_location_meaning_without_recalculating_items(db_session: Session, make_item: Callable[..., models.Item]) -> None:
    """Older seals keep their recorded location totals and omit unavailable item metrics."""
    from app.services.stocktake_closing import projected_report
    env = setup_round(db_session, make_item)
    legacy = summary(db_session, env)
    legacy.pop('entries')
    legacy.pop('item_summary')
    frozen = projected_report(legacy)
    assert frozen['summary'] == legacy['summary']
    assert 'item_summary' not in frozen
