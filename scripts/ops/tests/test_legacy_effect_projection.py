"""A legacy effect projection must prove that implicit unplaced stock is equal."""
import importlib.util
import hashlib
import json
from pathlib import Path
import sqlite3

import pytest


MODULE = Path(__file__).resolve().parents[1] / 'project_legacy_effects.py'
ITEM_ID = '11111111111111111111111111111111'
OTHER_ITEM_ID = '22222222222222222222222222222222'
WAREHOUSE_ROW_ID = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
WAREHOUSE_ROW_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
OTHER_WAREHOUSE_ROW_ID = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
OTHER_WAREHOUSE_ROW_UUID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
UNPLACED_ROW_ID = 'cccccccccccccccccccccccccccccccc'
UNPLACED_ROW_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'
OTHER_UNPLACED_ROW_ID = 'dddddddddddddddddddddddddddddddd'
OTHER_UNPLACED_ROW_UUID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'


def load_projection():
    assert MODULE.is_file(), 'The guarded legacy effect projection is not implemented.'
    spec = importlib.util.spec_from_file_location('legacy_effect_projection', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pair(warehouse_row_id='w', unplaced_row_id='u'):
    return [
        {'scope': 'warehouse', 'row_id': warehouse_row_id, 'before_quantity': 5, 'after_quantity': 9, 'delta': 4},
        {'scope': 'warehouse_unplaced', 'row_id': unplaced_row_id, 'before_quantity': 5, 'after_quantity': 9, 'delta': 4},
        {'scope': 'location', 'department': 'assembly', 'status': 'PRODUCTION', 'delta': -4},
    ]


def bound_pair():
    return pair(WAREHOUSE_ROW_UUID, UNPLACED_ROW_UUID)


def saved_projection_inputs(tmp_path):
    source, template = tmp_path / 'source.db', tmp_path / 'template.db'
    for path, modern in [(source, True), (template, False)]:
        with sqlite3.connect(path) as db:
            db.executescript('''
                CREATE TABLE alembic_version(version_num TEXT);
                CREATE TABLE inventory(
                    inventory_id TEXT PRIMARY KEY,
                    item_id TEXT UNIQUE,
                    warehouse_qty INTEGER
                );
                CREATE TABLE warehouse_box_items(id TEXT);
                CREATE TABLE warehouse_special_zone_items(id TEXT);
                CREATE TABLE warehouse_special_zones(id TEXT);
                CREATE TABLE inventory_operations(operation_id TEXT, contract_version INTEGER);
                CREATE TABLE transaction_logs(
                    log_id TEXT PRIMARY KEY,
                    item_id TEXT,
                    inventory_effect TEXT
                );
            ''')
            db.executemany(
                'INSERT INTO inventory VALUES (?,?,?)',
                [
                    (WAREHOUSE_ROW_ID, ITEM_ID, 9),
                    (OTHER_WAREHOUSE_ROW_ID, OTHER_ITEM_ID, 0),
                ],
            )
            db.execute(
                'INSERT INTO alembic_version VALUES (?)',
                ('20260911_0036' if modern else '20260910_0033',),
            )
            if modern:
                db.executescript('''
                    CREATE TABLE warehouse_unplaced_items(
                        id TEXT PRIMARY KEY,
                        item_id TEXT UNIQUE,
                        quantity INTEGER
                    );
                ''')
                db.executemany(
                    'INSERT INTO warehouse_unplaced_items VALUES (?,?,?)',
                    [
                        (UNPLACED_ROW_ID, ITEM_ID, 9),
                        (OTHER_UNPLACED_ROW_ID, OTHER_ITEM_ID, 0),
                    ],
                )
                db.execute("INSERT INTO inventory_operations VALUES ('op',2)")
                db.execute(
                    'INSERT INTO transaction_logs VALUES (?,?,?)',
                    ('log', ITEM_ID, json.dumps(bound_pair())),
                )
    return source, template


def test_projects_only_proven_redundant_cell_without_mutating_input():
    module = load_projection()
    original = pair()
    assert module.project_effect(original) == [original[0], original[2]]
    assert original == pair()


@pytest.mark.parametrize('field,value', [('delta', 3), ('before_quantity', 6), ('after_quantity', 10)])
def test_refuses_different_warehouse_and_unplaced_history(field, value):
    module = load_projection()
    effect = pair()
    effect[1][field] = value
    with pytest.raises(ValueError, match='equivalent'):
        module.project_effect(effect)


@pytest.mark.parametrize('mutation', ['missing_warehouse', 'duplicate', 'box', 'negative', 'bad_arithmetic'])
def test_refuses_history_outside_proven_projection_domain(mutation):
    module = load_projection()
    effect = pair()
    if mutation == 'missing_warehouse':
        effect.pop(0)
    elif mutation == 'duplicate':
        effect.append(dict(effect[1]))
    elif mutation == 'box':
        effect.append({'scope': 'warehouse_box', 'delta': 2, 'box_id': 'box'})
    elif mutation == 'negative':
        for cell in effect[:2]:
            cell.update(before_quantity=-1, after_quantity=3)
    else:
        for cell in effect[:2]:
            cell['delta'] = 3
    with pytest.raises(ValueError):
        module.project_effect(effect)


def test_legacy_effect_is_unchanged():
    module = load_projection()
    effect = [{'scope': 'warehouse', 'delta': 4}]
    assert module.project_effect(effect) == effect


def test_current_stock_must_be_exactly_implicit_unplaced():
    module = load_projection()
    module.assert_unplaced_equivalence([('item', 7)], [('item', 7)], placed_rows=0)
    for unplaced, placed in [([('item', 6)], 0), ([], 0), ([('item', 7), ('orphan', 0)], 0), ([('item', 7)], 1)]:
        with pytest.raises(ValueError):
            module.assert_unplaced_equivalence([('item', 7)], unplaced, placed_rows=placed)


def test_saved_projection_changes_only_proven_effects_and_keeps_original_evidence(tmp_path, monkeypatch):
    module = load_projection()
    monkeypatch.syspath_prepend(str(MODULE.parent))
    from build_legacy_db_candidate import build_candidate
    source, template = saved_projection_inputs(tmp_path)
    projection = tmp_path / 'projection'
    build_candidate(
        source,
        template,
        projection,
        expected_source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        expected_template_sha256=hashlib.sha256(template.read_bytes()).hexdigest(),
    )
    before = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in projection.iterdir()}
    output = tmp_path / 'converted'
    receipt = module.project_saved_candidate(projection, output)
    assert receipt['converted_log_count'] == 1
    assert receipt['workflow_verified'] is False
    with sqlite3.connect(output / 'candidate.db') as db:
        assert db.execute('SELECT contract_version FROM inventory_operations').fetchone() == (2,)
        assert json.loads(db.execute('SELECT inventory_effect FROM transaction_logs').fetchone()[0]) == [bound_pair()[0], bound_pair()[2]]
    with sqlite3.connect(output / 'source-evidence.db') as db:
        assert json.loads(db.execute('SELECT inventory_effect FROM transaction_logs').fetchone()[0]) == bound_pair()
    assert {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in projection.iterdir()} == before
    with pytest.raises(ValueError, match='already exists'):
        module.project_saved_candidate(projection, output)


@pytest.mark.parametrize(
    ('mismatch', 'row_id'),
    [
        ('warehouse_item', OTHER_WAREHOUSE_ROW_UUID),
        ('unplaced_item', OTHER_UNPLACED_ROW_UUID),
        ('missing_warehouse_row', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'),
        ('transaction_item', None),
        ('warehouse_row_id_missing', None),
        ('unplaced_row_id_missing', None),
        ('warehouse_row_id_malformed', 'not-a-uuid'),
        ('unplaced_row_id_malformed', 'not-a-uuid'),
    ],
)
def test_saved_projection_rejects_effect_row_item_confusion(
    tmp_path,
    monkeypatch,
    mismatch,
    row_id,
):
    module = load_projection()
    monkeypatch.syspath_prepend(str(MODULE.parent))
    from build_legacy_db_candidate import build_candidate

    source, template = saved_projection_inputs(tmp_path)
    with sqlite3.connect(source) as db:
        if mismatch == 'transaction_item':
            db.execute('UPDATE transaction_logs SET item_id=?', (OTHER_ITEM_ID,))
        else:
            effect = bound_pair()
            cell = effect[1] if mismatch.startswith('unplaced') else effect[0]
            if mismatch.endswith('_missing'):
                cell.pop('row_id')
            else:
                cell['row_id'] = row_id
            db.execute('UPDATE transaction_logs SET inventory_effect=?', (json.dumps(effect),))
    projection = tmp_path / 'projection'
    build_candidate(
        source,
        template,
        projection,
        expected_source_sha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        expected_template_sha256=hashlib.sha256(template.read_bytes()).hexdigest(),
    )
    output = tmp_path / 'converted'
    with pytest.raises(ValueError, match='effect row binding'):
        module.project_saved_candidate(projection, output)
    assert not output.exists()
