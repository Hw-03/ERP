"""Read-only online backup of the owned synthetic DB at a failure boundary."""
from __future__ import annotations
import argparse
from contextlib import closing
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time

def snapshot(source: Path, output: Path) -> dict:
    """Never accept the application DB name, a live worktree, or replacement output."""
    source = source.resolve(strict=True)
    output = output.resolve()
    marker = json.loads((source / '.mes-flaky-export.json').read_text())
    if marker['source'] != str(source) or (source / '.git').exists():
        raise ValueError('online snapshot requires an owned disposable export')
    allowed = Path(os.environ['MES_DIAG_OUTPUT']).resolve(strict=True)
    if not output.is_relative_to(allowed) or output.exists():
        raise ValueError('snapshot output must be a new diagnostic artifact')
    database = source / 'backend/mes_e2e.db'
    if database.is_symlink() or not database.resolve().is_relative_to(source):
        raise ValueError('synthetic database path escaped source')
    deadline = time.monotonic() + 10
    def progress(status: int, remaining: int, total: int) -> None:
        if time.monotonic() >= deadline:
            raise TimeoutError('online snapshot exceeded evidence budget')
    with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True, timeout=1)) as original:
        with closing(sqlite3.connect(output)) as destination:
            original.backup(destination, pages=256, progress=progress, sleep=0.05)
            check = destination.execute('PRAGMA quick_check').fetchone()[0]
    if check != 'ok':
        raise ValueError('snapshot quick_check failed')
    return {'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'quick_check': check,
        'source': str(database), 'output': str(output), 'wall_ns': time.time_ns(), 'mono_ns': time.monotonic_ns()}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(snapshot(args.source, args.output)))
