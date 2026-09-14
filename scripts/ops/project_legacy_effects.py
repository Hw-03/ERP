"""Prove a zero-placed-stock snapshot is representable by Friday implicit stock.

This dialect is Friday-only: keep the modern source evidence for any future upgrade.
It is not safe to run modern contract-v2 code against the projected ledger.
"""
from __future__ import annotations

import argparse
from contextlib import closing
import json
from pathlib import Path
import sqlite3
from typing import Any
import uuid


def project_effect(effect: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Remove U only when its entire history is provably identical to W.

No identities, warehouse/location cells, or version markers are rewritten. Effects
with placed-stock history are outside this narrowly proven conversion domain.
"""
    if not isinstance(effect, list) or any(not isinstance(cell, dict) for cell in effect):
        raise ValueError('inventory effect must be a cell list')
    unplaced = [cell for cell in effect if cell.get('scope') == 'warehouse_unplaced']
    if not unplaced:
        return effect
    warehouse = [cell for cell in effect if cell.get('scope') == 'warehouse']
    if len(unplaced) != 1 or len(warehouse) != 1:
        raise ValueError('a unique equivalent W/U pair is required')
    if any(cell.get('scope') not in {'warehouse', 'warehouse_unplaced', 'location'} for cell in effect):
        raise ValueError('placed or unknown stock history is outside the proven projection')
    fields = ('before_quantity', 'after_quantity', 'delta')
    for field in fields:
        w, u = warehouse[0].get(field), unplaced[0].get(field)
        if type(w) is not int or type(u) is not int or w != u:
            raise ValueError('W/U history is not equivalent')
    before, after, delta = (warehouse[0][field] for field in fields)
    if min(before, after) < 0 or after - before != delta:
        raise ValueError('invalid nonnegative W/U arithmetic')
    return [cell for cell in effect if cell.get('scope') != 'warehouse_unplaced']


def assert_unplaced_equivalence(
    warehouse: list[tuple[str, int]],
    unplaced: list[tuple[str, int]],
    *,
    placed_rows: int,
) -> None:
    """Fail closed unless every current implicit U equals the complete modern U."""
    if placed_rows != 0:
        raise ValueError('placed stock is outside the proven zero-placed projection')
    if len(dict(warehouse)) != len(warehouse) or len(dict(unplaced)) != len(unplaced):
        raise ValueError('duplicate item identity in stock')
    if dict(warehouse) != dict(unplaced):
        raise ValueError('current warehouse and unplaced stock are not equivalent')
    if any(type(quantity) is not int or quantity < 0 for _, quantity in warehouse + unplaced):
        raise ValueError('stock must be nonnegative integral quantities')


def _effect_row_item_id(
    source: sqlite3.Connection,
    *,
    table: str,
    id_column: str,
    row_id: Any,
) -> str:
    """Resolve a JSON UUID to its exact SQLite stock row and return its item."""
    if not isinstance(row_id, str):
        raise ValueError('effect row binding requires a UUID row_id')
    try:
        stored_row_id = uuid.UUID(row_id).hex
    except ValueError as error:
        raise ValueError('effect row binding requires a UUID row_id') from error
    row = source.execute(
        f'SELECT item_id FROM "{table}" WHERE "{id_column}"=?',
        (stored_row_id,),
    ).fetchone()
    if row is None:
        raise ValueError('effect row binding does not identify a stock row')
    return row[0]


def _assert_effect_row_binding(
    source: sqlite3.Connection,
    transaction_item_id: str,
    effect: list[dict[str, Any]],
) -> None:
    """Require each W/U row and its transaction log to identify one item."""
    scopes = {
        'warehouse': ('inventory', 'inventory_id'),
        'warehouse_unplaced': ('warehouse_unplaced_items', 'id'),
    }
    resolved = []
    for scope, (table, id_column) in scopes.items():
        cells = [cell for cell in effect if cell.get('scope') == scope]
        if len(cells) != 1:
            raise ValueError('effect row binding requires a unique W/U pair')
        resolved.append(
            _effect_row_item_id(
                source,
                table=table,
                id_column=id_column,
                row_id=cells[0].get('row_id'),
            )
        )
    if any(item_id != transaction_item_id for item_id in resolved):
        raise ValueError('effect row binding item does not match transaction log')


def project_saved_candidate(projection_directory: Path, output_directory: Path) -> dict[str, Any]:
    """Create a new Friday-only ledger dialect; never mutate the source projection.

Full row equality is required before conversion and is rechecked afterward with
only the individually proven JSON cell omissions permitted. Original JSON remains
in a complete, immutable source-evidence copy beside the new candidate.
"""
    from build_legacy_db_candidate import (
        _assert_integrity, _physical, _read_only, _row_hashes, _rows, _sha, _shapes,
        TARGET_REVISION,
    )

    projection_directory, output_directory = map(_physical, (projection_directory, output_directory))
    if output_directory.exists():
        raise ValueError('output directory already exists')
    receipt_path = _physical(projection_directory / 'receipt.json')
    candidate_path = _physical(projection_directory / 'candidate.db')
    source_path = _physical(projection_directory / 'source-evidence.db')
    input_hashes = {path: _sha(path) for path in (receipt_path, candidate_path, source_path)}
    receipt = json.loads(receipt_path.read_text(encoding='utf-8'))
    if (receipt.get('status') != 'PROJECTED_NOT_WORKFLOW_VERIFIED'
            or input_hashes[candidate_path] != receipt.get('candidate_sha256')
            or input_hashes[source_path] != receipt.get('source_evidence_sha256')):
        raise ValueError('projection receipt or input hash mismatch')
    with closing(_read_only(candidate_path)) as candidate, closing(_read_only(source_path)) as source:
        _assert_integrity(candidate)
        _assert_integrity(source)
        shapes = _shapes(candidate)
        if 'warehouse_unplaced_items' in shapes:
            raise ValueError('target must use the actual Friday schema without a live U table')
        if candidate.execute('SELECT version_num FROM alembic_version').fetchall() != [(TARGET_REVISION,)]:
            raise ValueError('candidate is not the Friday schema')
        for table, evidence in receipt['tables'].items():
            columns = shapes[table]
            if _row_hashes(_rows(candidate, table, columns)) != _row_hashes(_rows(source, table, columns)):
                raise ValueError(f'business rows differ before effect projection: {table}')
        placed_rows = sum(source.execute('SELECT count(*) FROM ' + table).fetchone()[0]
                          for table in ('warehouse_box_items', 'warehouse_special_zone_items', 'warehouse_special_zones'))
        assert_unplaced_equivalence(
            source.execute('SELECT item_id,warehouse_qty FROM inventory').fetchall(),
            source.execute('SELECT item_id,quantity FROM warehouse_unplaced_items').fetchall(),
            placed_rows=placed_rows,
        )
        changes = {}
        for log_id, item_id, raw in candidate.execute(
            'SELECT log_id,item_id,inventory_effect FROM transaction_logs'
        ):
            if raw is None or json.loads(raw) is None:
                continue
            original = json.loads(raw)
            projected = project_effect(original)
            if projected != original:
                _assert_effect_row_binding(source, item_id, original)
                changes[log_id] = json.dumps(projected, ensure_ascii=False, separators=(',', ':'))
        output_directory.mkdir()
        pending = output_directory / 'candidate.pending.db'
        archive = output_directory / 'source-evidence.db'
        with closing(sqlite3.connect(archive)) as target:
            source.backup(target)
        with closing(sqlite3.connect(pending)) as target:
            candidate.backup(target)
            target.execute('PRAGMA foreign_keys=ON')
            target.execute('BEGIN')
            target.executemany('UPDATE transaction_logs SET inventory_effect=? WHERE log_id=?',
                               [(raw, log_id) for log_id, raw in changes.items()])
            for table, columns in shapes.items():
                expected = _rows(candidate, table, columns)
                if table == 'transaction_logs':
                    id_index, effect_index = columns.index('log_id'), columns.index('inventory_effect')
                    expected = [tuple(changes.get(row[id_index], value) if index == effect_index else value
                                      for index, value in enumerate(row)) for row in expected]
                if _row_hashes(expected) != _row_hashes(_rows(target, table, columns)):
                    raise ValueError(f'unexpected change in projected candidate: {table}')
            _assert_integrity(target)
            target.commit()
        with closing(_read_only(archive)) as copied:
            _assert_integrity(copied)
            for table, columns in _shapes(source).items():
                if _row_hashes(_rows(source, table, columns)) != _row_hashes(_rows(copied, table, columns)):
                    raise ValueError('source evidence copy mismatch')
    if any(_sha(path) != digest for path, digest in input_hashes.items()):
        raise ValueError('input changed during effect projection')
    pending.rename(output_directory / 'candidate.db')
    result = {
        'status': 'FRIDAY_DIALECT_NOT_WORKFLOW_VERIFIED', 'workflow_verified': False,
        'source_projection': str(projection_directory),
        'source_projection_receipt_sha256': input_hashes[receipt_path],
        'candidate_sha256': _sha(output_directory / 'candidate.db'),
        'source_evidence_sha256': _sha(archive), 'converted_log_count': len(changes),
        'converted_log_ids': sorted(changes), 'all_other_table_values_unchanged': True,
        'contract_versions_unchanged': True, 'original_effects_retained_in_source_evidence': True,
        'constraint': 'Zero placed-stock snapshot only. Modern code requires an explicit reverse migration.',
    }
    with (output_directory / 'conversion-receipt.json').open('x', encoding='utf-8') as stream:
        json.dump(result, stream, ensure_ascii=False, indent=2)
    return result


def main() -> None:
    """Require explicit immutable projection and new output directory."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--projection-directory', type=Path, required=True)
    parser.add_argument('--output-directory', type=Path, required=True)
    args = parser.parse_args()
    result = project_saved_candidate(args.projection_directory, args.output_directory)
    print(json.dumps({key: result[key] for key in ('status', 'converted_log_count', 'all_other_table_values_unchanged')}))


if __name__ == '__main__':
    main()
