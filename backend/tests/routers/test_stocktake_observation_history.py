"""Observation history includes real applied work without inventing transaction rows."""
from tests.services.test_stocktake_counts import setup_round
from tests.services.test_stocktake_application import confirm, preview, apply
from app import models
import uuid
from datetime import datetime


def test_unchanged_application_is_one_searchable_history_work(client, db_session, make_item):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, count))
    response = client.get('/api/inventory/transactions/display-groups', params={'search': 'Counted item'})
    assert response.status_code == 200, response.text
    groups = response.json()['groups']
    assert len(groups) == 1
    assert groups[0]['logs'] == []
    work = groups[0]['stocktake']
    assert work['item_count'] == work['matched_item_count'] == 1
    assert work['changed_item_count'] == 0 and work['unchanged_item_count'] == 1
    assert work['observations'][0]['before_quantities'] == work['observations'][0]['after_quantities']
    assert db_session.query(models.TransactionLog).count() == 0
    summary = client.get('/api/inventory/transactions/summary', params={'search': 'Counted item'}).json()
    assert summary['total'] == summary['adjust_count'] == 1


def test_observation_history_reports_classification_changes(client, db_session, make_item):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env, normal=12)
    apply(db_session, env, preview(db_session, env, count))
    response = client.get('/api/inventory/transactions/display-groups', params={'operation_keys': 'stocktake'})
    work = response.json()['groups'][0]['stocktake']
    assert work['changed_item_count'] == 1
    line = work['observations'][0]
    assert line['after_quantities']['normal'] == 12


def test_search_keeps_whole_work_and_prioritizes_matching_unchanged_item(client, db_session, make_item):
    extra = make_item(name='Search unchanged companion', warehouse_qty=3)
    extra.unit = 'SET'
    db_session.commit()
    env = setup_round(db_session, make_item)
    first = confirm(db_session, env, normal=12)
    targets = env[0].list_targets(db_session, uuid.UUID(env[3]['round_id']))['items']
    target = next(row for row in targets if row['item_id'] == str(extra.item_id) and row['scope_id'] == 'warehouse')
    second = confirm(db_session, (*env[:2], extra, env[3], target), normal=3)
    proposal = env[0].execute(db_session, env[1], 'application_preview', str(uuid.uuid4()),
        {'round_id': env[3]['round_id'], 'confirmation_revision_ids': [first['confirmation_revision_id'], second['confirmation_revision_id']]})
    apply(db_session, env, proposal)
    group = client.get('/api/inventory/transactions/display-groups', params={'search': 'Search unchanged'}).json()['groups'][0]
    assert len(group['logs']) == 0
    work = group['stocktake']
    assert work['item_count'] == 2 and work['matched_item_count'] == 1
    assert work['changed_item_count'] == work['unchanged_item_count'] == 1
    assert work['observations'][0]['item_id'] == str(extra.item_id)
    assert work['observations'][0]['unit'] == 'SET'
    assert client.get('/api/inventory/transactions/summary', params={'search': 'Search unchanged'}).json()['total'] == 1
    assert client.get('/api/inventory/transactions/display-groups', params={'department': '조립'}).json()['groups'] == []


def test_unchanged_work_cursor_ties_do_not_skip_operations(client, db_session, make_item):
    env = setup_round(db_session, make_item)
    for _ in range(3):
        targets = env[0].list_targets(db_session, uuid.UUID(env[3]['round_id']))['items']
        target = next(row for row in targets if row['target_id'] == env[4]['target_id'])
        current = (*env[:4], target)
        count = confirm(db_session, current)
        apply(db_session, current, preview(db_session, current, count))
    for operation in db_session.query(models.InventoryOperation).filter_by(domain='stocktake', action='apply'):
        operation.effective_at = datetime(2026, 10, 12, 9)
    db_session.commit()
    keys, cursor = [], None
    for _ in range(3):
        params = {'operation_keys': 'stocktake', 'limit': 1}
        if cursor:
            params['cursor'] = cursor
        page = client.get('/api/inventory/transactions/display-groups', params=params).json()
        assert len(page['groups']) == 1
        assert len(page['groups'][0]['stocktake']['observations']) == 1
        keys.append(page['groups'][0]['key'])
        cursor = page['next_cursor']
    assert len(set(keys)) == 3
    assert cursor is None
