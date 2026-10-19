"""Failure snapshots are confined to synthetic exports and new artifact paths."""
from __future__ import annotations
import importlib.util
from contextlib import closing
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('snapshot_db', Path(__file__).with_name('snapshot-db.py'))
snapshot_db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(snapshot_db)

class SnapshotGuards(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.source, self.output = self.base / 'source', self.base / 'artifacts'
        (self.source / 'backend').mkdir(parents=True)
        self.output.mkdir()
        (self.source / '.mes-flaky-export.json').write_text(json.dumps({'source': str(self.source)}))
        with closing(sqlite3.connect(self.source / 'backend/mes_e2e.db')) as db:
            db.executescript('CREATE TABLE probe(value INTEGER); INSERT INTO probe VALUES(7);')
        environment = patch.dict(os.environ, {'MES_DIAG_OUTPUT': str(self.output)})
        environment.start()
        self.addCleanup(environment.stop)

    def test_online_backup_preserves_source_and_exact_rows(self) -> None:
        destination = self.output / 'snapshot.db'
        receipt = snapshot_db.snapshot(self.source, destination)
        self.assertEqual(receipt['quick_check'], 'ok')
        for path in (self.source / 'backend/mes_e2e.db', destination):
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute('SELECT value FROM probe').fetchall(), [(7,)])

    def test_rejects_existing_or_outside_output(self) -> None:
        destination = self.output / 'existing.db'
        destination.write_bytes(b'preserve')
        for path in (destination, self.base / 'outside.db'):
            with self.assertRaises(ValueError):
                snapshot_db.snapshot(self.source, path)
        self.assertEqual(destination.read_bytes(), b'preserve')

    def test_rejects_a_worktree_or_wrong_marker(self) -> None:
        (self.source / '.git').write_text('gitdir: protected')
        with self.assertRaises(ValueError):
            snapshot_db.snapshot(self.source, self.output / 'snapshot.db')
        (self.source / '.git').unlink()
        (self.source / '.mes-flaky-export.json').write_text(json.dumps({'source': str(self.base)}))
        with self.assertRaises(ValueError):
            snapshot_db.snapshot(self.source, self.output / 'snapshot.db')

if __name__ == '__main__':
    unittest.main()
