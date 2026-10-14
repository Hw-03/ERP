"""Calendar counts the same complete work units as history, without hydration."""
from datetime import datetime

from app import models
from tests.routers.test_transaction_display_groups import _add_log, _add_batch
from tests.services.test_stocktake_counts import setup_round
from tests.services.test_stocktake_application import confirm, preview, apply


def test_calendar_includes_unchanged_work_at_kst_year_boundary(client, db_session, make_item, monkeypatch):
    env = setup_round(db_session, make_item)
    count = confirm(db_session, env)
    apply(db_session, env, preview(db_session, env, count))
    operation = db_session.query(models.InventoryOperation).filter_by(domain='stocktake', action='apply').one()
    operation.effective_at = datetime(2025, 12, 31, 15)
    db_session.commit()
    from app.routers.inventory import transactions
    monkeypatch.setattr(transactions, 'hydrate_observation_groups', lambda *_: (_ for _ in ()).throw(AssertionError('calendar hydrated quantities')))
    response = client.get('/api/inventory/transactions/display-calendar', params={'year': 2026, 'month': 1})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['days']['2026-01-01']['total'] == body['days']['2026-01-01']['adjust_count'] == 1
    assert body['days']['2026-01-02']['total'] == 0
    assert body['months']['2026-01'] == 1 and body['months']['2026-12'] == 0
    assert len(body['days']) == 31 and len(body['months']) == 12
    assert db_session.query(models.TransactionLog).count() == 0
    assert client.get('/api/inventory/transactions/display-calendar', params={'year': 2025, 'month': 12}).json()['months']['2025-12'] == 0


def test_calendar_keeps_batch_work_and_counts_beyond_page_limit(client, db_session, make_item):
    item = make_item(name='calendar searchable item')
    batch = _add_batch(db_session, 'calendar')
    batch.submitted_at = datetime(2026, 10, 12, 1)
    for _ in range(3):
        _add_log(db_session, item, created_at=datetime(2026, 10, 12, 2), operation_batch_id=batch.batch_id,
                 transaction_type=models.TransactionTypeEnum.PRODUCE, department='조립')
    for index in range(105):
        _add_log(db_session, item, created_at=datetime(2026, 10, 12, 3), department='창고')
    db_session.commit()
    params = {'year': 2026, 'month': 10, 'search': 'calendar searchable'}
    body = client.get('/api/inventory/transactions/display-calendar', params=params).json()
    assert body['days']['2026-10-12'] == {'total': 106, 'warehouse_count': 105, 'dept_count': 1, 'adjust_count': 0, 'other_count': 0}
    assert body['months']['2026-10'] == 106
    assert client.get('/api/inventory/transactions/summary', params={'search': params['search']}).json()['total'] == 106
    assert client.get('/api/inventory/transactions/display-calendar', params={**params, 'department': '조립'}).json()['days']['2026-10-12']['total'] == 1
    assert client.get('/api/inventory/transactions/display-calendar', params={**params, 'search': 'no match'}).json()['months']['2026-10'] == 0


def test_calendar_uses_request_date_and_retains_legacy_defect_grouping(client, db_session, make_item):
    item = make_item(name='calendar legacy')
    batch = _add_batch(db_session, 'request-date')
    batch.submitted_at = datetime(2026, 9, 30, 14, 59)
    _add_log(db_session, item, created_at=datetime(2026, 10, 1, 1), operation_batch_id=batch.batch_id,
             transaction_type=models.TransactionTypeEnum.PRODUCE, department='조립')
    for kind in (models.TransactionTypeEnum.MARK_DEFECTIVE, models.TransactionTypeEnum.DEFECT_SCRAP):
        _add_log(db_session, item, created_at=datetime(2026, 10, 12, 1, 0, 0 if kind == models.TransactionTypeEnum.MARK_DEFECTIVE else 10), transaction_type=kind,
                 produced_by='calendar operator', department='조립', reason_category='OTHER', reason_memo='same reason')
    db_session.commit()
    body = client.get('/api/inventory/transactions/display-calendar', params={'year': 2026, 'month': 10}).json()
    assert body['months']['2026-09'] == 1
    assert body['days']['2026-10-01']['total'] == 0
    assert body['days']['2026-10-12']['total'] == 1
    # Preserve main's ledger work identity for legacy KPI counts.
    assert client.get('/api/inventory/transactions/summary', params={'date_from': '2026-10-12', 'date_to': '2026-10-12'}).json()['total'] == 2


def test_calendar_rejects_invalid_month(client):
    assert client.get('/api/inventory/transactions/display-calendar', params={'year': 2026, 'month': 13}).status_code == 422


def test_calendar_counts_multi_category_application_once_and_matches_filters(client, db_session, make_item):
    env = setup_round(db_session, make_item)
    from app.services import inventory_operations
    cutover_operation = inventory_operations.create_business_operation(db_session, domain='pool', action='cutover',
        display_label='Fixture', actor_name=env[1].name, actor_employee_id=env[1].employee_id)
    db_session.add(models.DefectPoolCutover(actor_employee_id=env[1].employee_id, operation_id=cutover_operation.operation_id,
        source_fingerprint='a' * 64, cutover_version=1, performed_at=datetime(2026, 1, 2)))
    db_session.flush()
    count = confirm(db_session, env, normal=8, defect=2, b_grade=3, obsolete=4)
    apply(db_session, env, preview(db_session, env, count))
    operation = db_session.query(models.InventoryOperation).filter_by(domain='stocktake', action='apply').one()
    operation.effective_at = datetime(2026, 2, 28, 15)
    env[2].model_symbol = '3'
    env[2].process_type_code = 'AR'
    db_session.add_all([models.ProductSymbol(slot=1, symbol='3', model_name='DX3000'),
                        models.ProductSymbol(slot=2, symbol='7', model_name='COCOON')])
    db_session.commit()
    params = {'year': 2026, 'month': 3, 'operation_keys': 'stocktake', 'search': env[2].item_name}
    body = client.get('/api/inventory/transactions/display-calendar', params=params).json()
    assert body['days']['2026-03-01']['total'] == body['days']['2026-03-01']['adjust_count'] == 1
    evidence = db_session.query(models.StocktakeApplicationLine).one()
    assert all(evidence.before_quantities[key] != evidence.after_quantities[key]
               for key in ('normal', 'defect', 'b_grade', 'obsolete'))
    assert client.get('/api/inventory/transactions/display-groups', params={'operation_keys': 'stocktake', 'search': env[2].item_name}).json()['groups'][0]['key'] == str(operation.operation_id)
    assert client.get('/api/inventory/transactions/display-calendar', params={**params, 'operation_keys': 'process'}).json()['months']['2026-03'] == 0
    assert client.get('/api/inventory/transactions/display-calendar', params={**params, 'model': 'DX3000'}).json()['months']['2026-03'] == 1
    assert client.get('/api/inventory/transactions/display-calendar', params={**params, 'model': 'COCOON'}).json()['months']['2026-03'] == 0
    assert client.get('/api/inventory/transactions/display-calendar', params={**params, 'process_step': 'F'}).json()['months']['2026-03'] == 0
    february = client.get('/api/inventory/transactions/display-calendar', params={'year': 2024, 'month': 2}).json()
    assert len(february['days']) == 29
