"""Guard review switching before any process or database mutation."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
from contextlib import closing

import pytest

SPEC = importlib.util.spec_from_file_location(
    'integration_review', Path(__file__).resolve().parents[3] / 'scripts/dev/mes_integration_review.py',
)
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)


@pytest.fixture
def sealed_pair(tmp_path):
    run = tmp_path / '_attic/runtime/integration-20261015/resume-0843'
    run.mkdir(parents=True)
    data = {'version': 1, 'run': str(run), 'profiles': {}, 'common': {}}
    for name in ['qa_control.py', 'qa_session_original.py']:
        source = run/name
        source.write_text('# test-only controller', encoding='utf-8')
        data['common'][name] = hashlib.sha256(source.read_bytes()).hexdigest()
    for name, revision in [('baseline', '20261014_0045'), ('integrated', '20261015_0046')]:
        base = run / name
        (base / 'workspace').mkdir(parents=True)
        source = base / 'workspace/source.py'
        source.write_text('unchanged\n', encoding='utf-8')
        seed = base / 'review-seed.db'
        with sqlite3.connect(seed) as db:
            db.execute('CREATE TABLE alembic_version(version_num TEXT)')
            db.execute('INSERT INTO alembic_version VALUES (?)', (revision,))
        config = {'database':str(base/'review.db'), 'workspace':str(base/'workspace'),
                  'backend_port':8035, 'frontend_port':3035}
        config_path = base / 'config.json'
        config_path.write_text(json.dumps(config), encoding='utf-8')
        data['profiles'][name] = {'revision':revision, 'source_ref':'test', 'files':{
            p.relative_to(run).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [source, seed, config_path]
        }}
    path = run / 'review-manifest.json'

    def save():
        path.write_text(json.dumps(data), encoding='utf-8')
        return hashlib.sha256(path.read_bytes()).hexdigest()

    return tmp_path, run, path, data, save


def test_valid_pair_preserves_explicit_versions(sealed_pair):
    repo, _, path, data, save = sealed_pair
    assert review.validate_manifest(repo, path, save()) == data


def test_long_dependency_path_is_hashed_without_skipping_it(sealed_pair):
    repo, run, path, data, save = sealed_pair
    added = run/'integrated/workspace'/('nested-'+'x'*70)/('package-'+'y'*70)/'runtime.js'
    review.disk_path(added.parent).mkdir(parents=True)
    review.disk_path(added).write_text('sealed dependency', encoding='utf-8')
    data['profiles']['integrated']['files'][added.relative_to(run).as_posix()] = review.digest(added)
    assert review.validate_manifest(repo, path, save()) == data
    review.disk_path(added).write_text('changed dependency', encoding='utf-8')
    with pytest.raises(ValueError, match='changed'):
        review.validate_manifest(repo, path, hashlib.sha256(path.read_bytes()).hexdigest())


@pytest.mark.parametrize('target', ['source', 'added_source', 'manifest', 'seed', 'config', 'escape', 'junction'])
def test_modified_inputs_are_rejected(sealed_pair, target, monkeypatch):
    repo, run, path, data, save = sealed_pair
    expected = save()
    if target == 'source':
        (run/'integrated/workspace/source.py').write_text('changed')
    elif target == 'added_source':
        (run/'integrated/workspace/extra.py').write_text('changed')
    elif target == 'manifest':
        path.write_text('{}')
    elif target == 'seed':
        with sqlite3.connect(run/'integrated/review-seed.db') as db:
            db.execute("UPDATE alembic_version SET version_num='20261014_0045'")
        seed = run/'integrated/review-seed.db'
        data['profiles']['integrated']['files']['integrated/review-seed.db'] = hashlib.sha256(seed.read_bytes()).hexdigest()
        expected = save()
    elif target == 'config':
        cfg = run/'integrated/config.json'
        value = json.loads(cfg.read_text()); value['database'] = 'C:/ERP/backend/mes.db'
        cfg.write_text(json.dumps(value)); data['profiles']['integrated']['files']['integrated/config.json'] = hashlib.sha256(cfg.read_bytes()).hexdigest()
        expected = save()
    elif target == 'escape':
        data['profiles']['integrated']['files']['../outside.txt'] = '0'*64
        expected = save()
    else:
        monkeypatch.setattr(review, 'is_reparse', lambda p: p.name == 'workspace')
    with pytest.raises(ValueError):
        review.validate_manifest(repo, path, expected)


def test_dirty_checkout_stops_before_controller_call(sealed_pair, monkeypatch):
    repo, _, path, _, save = sealed_pair
    monkeypatch.setattr(review.subprocess, 'check_output', lambda *a, **kw: b' M existing.py')
    calls = []
    monkeypatch.setattr(review.subprocess, 'run', lambda *a, **kw: calls.append(a))
    with pytest.raises(ValueError, match='uncommitted'):
        review.select_version(repo, path, save(), 'integrated', False)
    assert calls == []


def test_foreign_process_error_never_changes_database_state(sealed_pair, monkeypatch):
    repo, run, path, _, save = sealed_pair
    (run/'baseline/session.json').write_text(json.dumps({'status':'running'}))
    monkeypatch.setattr(review.subprocess, 'check_output', lambda *a, **kw: b'')
    def refuse(*args, **kwargs):
        raise ValueError('ownership mismatch')
    monkeypatch.setattr(review.subprocess, 'run', refuse)
    with pytest.raises(ValueError, match='ownership'):
        review.select_version(repo, path, save(), 'integrated', True)
    assert not (run/'baseline/review-state.json').exists()


def test_stopped_database_tampering_prevents_start(sealed_pair, monkeypatch):
    repo, run, path, _, save = sealed_pair
    for name in ['baseline','integrated']:
        (run/name/'session.json').write_text(json.dumps({'status':'stopped'}))
    database = run/'integrated/review.db'
    database.write_bytes((run/'integrated/review-seed.db').read_bytes())
    (run/'integrated/review-state.json').write_text(json.dumps({'databaseSha256':'0'*64}))
    monkeypatch.setattr(review.subprocess, 'check_output', lambda *a, **kw: b'')
    calls = []
    monkeypatch.setattr(review.subprocess, 'run', lambda *a, **kw: calls.append(a))
    with pytest.raises(ValueError, match='changed outside'):
        review.select_version(repo, path, save(), 'integrated', False)
    assert calls == []


def test_reset_keeps_previous_review_data_and_restores_matching_seed(sealed_pair, monkeypatch):
    repo, run, path, _, save = sealed_pair
    for name in ['baseline','integrated']:
        (run/name/'session.json').write_text(json.dumps({'status':'stopped'}))
    database = run/'integrated/review.db'
    database.write_bytes((run/'integrated/review-seed.db').read_bytes())
    with closing(sqlite3.connect(database)) as db, db:
        db.execute('CREATE TABLE user_review(note TEXT)')
        db.execute("INSERT INTO user_review VALUES ('keep my verification')")
    (run/'integrated/review-state.json').write_text(json.dumps({'databaseSha256':review.digest(database)}))
    monkeypatch.setattr(review.subprocess, 'check_output', lambda *a, **kw: b'')
    calls = []
    monkeypatch.setattr(review.subprocess, 'run', lambda *a, **kw: calls.append(a))
    review.select_version(repo, path, save(), 'integrated', True)
    backups = list((run/'integrated').glob('review-before-reset-*.db'))
    assert len(backups) == 1
    with closing(sqlite3.connect(backups[0])) as db:
        assert db.execute('SELECT note FROM user_review').fetchall() == [('keep my verification',)]
    assert review.digest(database) == review.digest(run/'integrated/review-seed.db')
    assert calls[0][0][-2:] == ['start','integrated']


def test_wal_changes_are_not_hidden_by_unchanged_main_database(sealed_pair):
    _, run, _, _, _ = sealed_pair
    database = run/'integrated/review-seed.db'
    original = review.database_fingerprint(database)
    Path(str(database)+'-wal').write_bytes(b'new pending writes')
    changed = review.database_fingerprint(database)
    assert changed['databaseSha256'] == original['databaseSha256']
    assert changed['walSha256'] != original['walSha256']
