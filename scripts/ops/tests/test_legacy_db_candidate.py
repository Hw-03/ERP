"""The legacy candidate builder must never overwrite its inputs or hide lost data."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys

import pytest

MODULE = Path(__file__).resolve().parents[1] / 'build_legacy_db_candidate.py'


def load_builder():
    assert MODULE.is_file(), 'The isolated legacy candidate builder has not been implemented.'
    spec = importlib.util.spec_from_file_location('legacy_db_candidate', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def database(path, revision, modern=False):
    with sqlite3.connect(path) as db:
        db.executescript('''
            CREATE TABLE alembic_version(version_num TEXT PRIMARY KEY);
            CREATE TABLE alembic_schema_state(id INTEGER PRIMARY KEY, revision TEXT, schema_fingerprint TEXT);
            CREATE TABLE items(id TEXT PRIMARY KEY, name TEXT NOT NULL);
            CREATE TABLE inventory(id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), quantity INTEGER NOT NULL);
        ''')
        db.execute('INSERT INTO alembic_version VALUES (?)', (revision,))
        db.execute('INSERT INTO alembic_schema_state VALUES (1,?,?)', (revision, 'schema-contract'))
        if modern:
            db.execute('ALTER TABLE items ADD COLUMN new_metadata TEXT')
            db.execute('CREATE TABLE modern_only(id TEXT PRIMARY KEY, evidence TEXT)')
            db.execute('INSERT INTO items VALUES (?,?,?)', ('item-1', 'current-name', 'preserve-me'))
            db.execute('INSERT INTO inventory VALUES (?,?,?)', ('inv-1', 'item-1', 17))
            db.execute('INSERT INTO modern_only VALUES (?,?)', ('evidence-1', 'source-data'))


@pytest.fixture
def inputs(tmp_path):
    source = tmp_path / 'source.db'
    template = tmp_path / 'template.db'
    database(source, '20260911_0036', modern=True)
    database(template, '20260910_0033')
    return source, template


def test_copies_latest_rows_preserves_schema_and_archives_newer_fields(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    before = sha(source), sha(template)
    output = tmp_path / 'candidate-run'
    receipt = builder.build_candidate(
        source,
        template,
        output,
        expected_source_sha256=sha(source),
        expected_template_sha256=sha(template),
    )
    assert (sha(source), sha(template)) == before
    with sqlite3.connect(output / 'candidate.db') as db:
        assert db.execute('SELECT version_num FROM alembic_version').fetchone()[0] == '20260910_0033'
        assert db.execute('SELECT name FROM items').fetchone()[0] == 'current-name'
        assert db.execute('SELECT quantity FROM inventory').fetchone()[0] == 17
        assert [r[1] for r in db.execute('PRAGMA table_info(items)')] == ['id', 'name']
        assert db.execute('PRAGMA foreign_key_check').fetchall() == []
    with sqlite3.connect(output / 'source-evidence.db') as db:
        assert db.execute('SELECT new_metadata FROM items').fetchone()[0] == 'preserve-me'
        assert db.execute('SELECT evidence FROM modern_only').fetchone()[0] == 'source-data'
    assert receipt['status'] == 'PROJECTED_NOT_WORKFLOW_VERIFIED'
    assert receipt['excluded_tables'] == ['modern_only']
    assert receipt['excluded_columns'] == {'items': ['new_metadata']}
    assert json.loads((output / 'receipt.json').read_text())['source_sha256'] == before[0]
    assert receipt['trusted_schema_template_sha256'] == before[1]


def test_rejects_existing_output_without_changing_any_bytes(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    output = tmp_path / 'existing'
    output.mkdir()
    sentinel = output / 'candidate.db'
    sentinel.write_bytes(b'do not overwrite')
    with pytest.raises(ValueError, match='already exists'):
        builder.build_candidate(
            source,
            template,
            output,
            expected_source_sha256=sha(source),
            expected_template_sha256=sha(template),
        )
    assert sentinel.read_bytes() == b'do not overwrite'


def test_rejects_wrong_source_hash_before_creating_output(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    output = tmp_path / 'bad-hash'
    with pytest.raises(ValueError, match='source hash'):
        builder.build_candidate(
            source,
            template,
            output,
            expected_source_sha256='0' * 64,
            expected_template_sha256=sha(template),
        )
    assert not output.exists()


def test_rejects_wrong_trusted_template_hash_before_creating_output(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    output = tmp_path / 'untrusted-template'
    with pytest.raises(ValueError, match='template hash'):
        builder.build_candidate(
            source,
            template,
            output,
            expected_source_sha256=sha(source),
            expected_template_sha256='0' * 64,
        )
    assert not output.exists()


def test_cli_requires_trusted_template_hash(inputs, tmp_path):
    source, template = inputs
    result = subprocess.run(
        [
            sys.executable,
            str(MODULE),
            '--source',
            str(source),
            '--schema-template',
            str(template),
            '--output-directory',
            str(tmp_path / 'missing-template-hash'),
            '--source-sha256',
            sha(source),
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 2
    assert '--schema-template-sha256' in result.stderr


def test_rejects_template_with_wrong_revision(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    with sqlite3.connect(template) as db:
        db.execute("UPDATE alembic_version SET version_num='20260911_0036'")
    with pytest.raises(ValueError, match='template revision'):
        builder.build_candidate(
            source,
            template,
            tmp_path / 'wrong-revision',
            expected_source_sha256=sha(source),
            expected_template_sha256=sha(template),
        )


def test_foreign_key_failure_does_not_publish_candidate(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    with sqlite3.connect(source) as db:
        db.execute("UPDATE inventory SET item_id='absent'")
    output = tmp_path / 'broken-reference'
    with pytest.raises(ValueError, match='foreign key.*inventory'):
        builder.build_candidate(
            source,
            template,
            output,
            expected_source_sha256=sha(source),
            expected_template_sha256=sha(template),
        )
    assert not (output / 'candidate.db').exists()
    assert not (output / 'receipt.json').exists()


def test_unknown_missing_target_column_is_not_filled_silently(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    with sqlite3.connect(template) as db:
        db.execute('ALTER TABLE items ADD COLUMN unexplained TEXT')
    with pytest.raises(ValueError, match='missing source column'):
        builder.build_candidate(
            source,
            template,
            tmp_path / 'missing-column',
            expected_source_sha256=sha(source),
            expected_template_sha256=sha(template),
        )


def test_read_only_checkpointed_wal_input_creates_no_sidecars(inputs):
    builder = load_builder()
    source, _ = inputs
    db = sqlite3.connect(source)
    db.execute('PRAGMA journal_mode=WAL')
    db.close()
    with builder._read_only(source) as read:
        assert read.execute('SELECT count(*) FROM items').fetchone() == (1,)
        assert not Path(str(source) + '-shm').exists()
        assert not Path(str(source) + '-wal').exists()
    read.close()


def test_rejects_uncheckpointed_wal_input(inputs, tmp_path):
    builder = load_builder()
    source, template = inputs
    db = sqlite3.connect(source)
    try:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute("UPDATE inventory SET quantity=18")
        db.commit()
        with pytest.raises(ValueError, match='checkpointed'):
            builder.build_candidate(
                source,
                template,
                tmp_path / 'wal-input',
                expected_source_sha256=sha(source),
                expected_template_sha256=sha(template),
            )
        assert not (tmp_path / 'wal-input').exists()
    finally:
        db.close()
