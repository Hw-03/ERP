"""Select the approved local review pair without checking out or deploying code."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import stat
import subprocess
import sys
from datetime import datetime
from contextlib import closing

RUN_RELATIVE = Path('_attic/runtime/integration-20261015/resume-0843')
REVISIONS = {'baseline': '20261014_0045', 'integrated': '20261015_0046'}


def disk_path(path: Path) -> Path:
    """Keep logical paths stable while supporting deep Windows dependency trees."""
    absolute = str(path.absolute())
    return Path('\\\\?\\'+absolute) if os.name == 'nt' and not absolute.startswith('\\\\?\\') else path


def digest(path: Path) -> str:
    """Hash bytes without loading a DB or build into memory."""
    with disk_path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def is_reparse(path: Path) -> bool:
    """Do not follow Windows junctions or symbolic links during validation."""
    actual = disk_path(path)
    info = actual.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT)


def confined(run: Path, relative: str) -> Path:
    """Require an existing plain path below the exact approved run."""
    rel = Path(relative)
    if rel.is_absolute() or '..' in rel.parts:
        raise ValueError('Path escapes the approved run')
    path = run / rel
    if not path.resolve().is_relative_to(run.resolve()):
        raise ValueError('Resolved path escapes the approved run')
    for part in [path, *path.parents]:
        if part == run.parent:
            break
        if disk_path(part).exists() and is_reparse(part):
            raise ValueError('Reparse path is not allowed')
    return path


def verify_database(path: Path, revision: str) -> None:
    """Read the exact schema pair; no migration or initialization is permitted."""
    with closing(sqlite3.connect(path.resolve().as_uri()+'?mode=ro', uri=True)) as db:
        if db.execute('SELECT version_num FROM alembic_version').fetchall() != [(revision,)]:
            raise ValueError('Code and database revision mismatch')
        if db.execute('PRAGMA quick_check').fetchone() != ('ok',):
            raise ValueError('Database quick check failed')


def database_fingerprint(path: Path) -> dict:
    """Include pending WAL bytes, which are part of the review database state."""
    wal = confined(path.parent, path.name+'-wal')
    return {'databaseSha256':digest(path),
            'walSha256':digest(wal) if wal.exists() and wal.stat().st_size else None}


def workspace_files(workspace: Path) -> list[Path]:
    """Seal source, dependency, and production artifacts; omit runtime caches only."""
    files = []
    for directory, children, names in os.walk(disk_path(workspace), followlinks=False):
        base = Path(directory[4:] if directory.startswith('\\\\?\\') else directory)
        children[:] = [name for name in children if name not in {'__pycache__', '.cache', '.next'}
                       and not (name == 'cache' and base.name in {'.next-prod', '.next'})]
        for name in children + names:
            if is_reparse(base/name):
                raise ValueError('Reparse path in review workspace')
        files.extend(base/name for name in names if name != 'tsconfig.tsbuildinfo')
    return sorted(files)


def validate_manifest(repo: Path, manifest_path: Path, expected_hash: str) -> dict:
    """Reject changed sources, artifacts, paths, or code/database combinations."""
    run = confined(repo, RUN_RELATIVE.as_posix()).resolve()
    if manifest_path.resolve() != run/'review-manifest.json' or digest(manifest_path) != expected_hash:
        raise ValueError('Manifest identity mismatch')
    data = json.loads(manifest_path.read_text(encoding='utf-8'))
    if data.get('version') != 1 or Path(data['run']).resolve() != run or set(data['profiles']) != set(REVISIONS):
        raise ValueError('Unexpected manifest version or profiles')
    for relative, expected in data['common'].items():
        if digest(confined(run, relative)) != expected:
            raise ValueError('Review controller changed')
    for name, revision in REVISIONS.items():
        profile = data['profiles'][name]
        if profile['revision'] != revision:
            raise ValueError('Profile revision mismatch')
        for relative in profile['files']:
            if not relative.startswith(name+'/') or Path(relative).is_absolute() or '..' in Path(relative).parts:
                raise ValueError('Review file path escapes profile')
        expected_workspace = {str(Path(relative).relative_to(name+'/workspace'))
                              for relative in profile['files'] if relative.startswith(name+'/workspace/')}
        workspace = confined(run, name+'/workspace')
        actual_workspace = {str(path.relative_to(workspace)) for path in workspace_files(workspace)}
        if expected_workspace != actual_workspace:
            raise ValueError('Review workspace inventory changed')
        # The inventory walk checked every workspace entry for reparse points once.
        # Avoid checking the same parent chain for every dependency file again.
        for relative, expected in profile['files'].items():
            path = run/relative if relative.startswith(name+'/workspace/') else confined(run, relative)
            if digest(path) != expected:
                raise ValueError('Review source or artifact changed: '+relative)
        required = {f'{name}/config.json', f'{name}/review-seed.db'}
        if not required.issubset(profile['files']):
            raise ValueError('Missing sealed inputs')
        config = json.loads((run/name/'config.json').read_text(encoding='utf-8'))
        if (Path(config['database']).resolve() != run/name/'review.db'
                or Path(config['workspace']).resolve() != run/name/'workspace'
                or [config['backend_port'],config['frontend_port']] != [8035,3035]):
            raise ValueError('Unsafe QA configuration')
        verify_database(confined(run, f'{name}/review-seed.db'), revision)
    if 'node' in data:
        node = Path(data['node']['path'])
        if str(node.resolve()).lower() != str(Path('C:/ERP/_attic/runtime/tools/node-v20.20.2-win-x64/node.exe').resolve()).lower():
            raise ValueError('Unexpected shared Node runtime')
        if digest(node) != data['node']['sha256']:
            raise ValueError('Node runtime changed')
        for name in REVISIONS:
            config = json.loads((run/name/'config.json').read_text(encoding='utf-8'))
            if Path(config['node']).resolve() != node.resolve():
                raise ValueError('Configured Node differs from sealed runtime')
    return data


def select_version(repo: Path, manifest_path: Path, expected_hash: str, version: str | None, reset: bool) -> None:
    """Stop only owned QA processes and keep each version's editable DB separate."""
    data = validate_manifest(repo, manifest_path, expected_hash)
    if version is not None and version not in REVISIONS:
        raise ValueError('Unknown review version')
    if not {'qa_control.py', 'qa_session_original.py'}.issubset(data['common']):
        raise ValueError('Controller ownership guards must be sealed')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=repo).strip():
        raise ValueError('Commit or preserve uncommitted work before switching')
    run = Path(data['run'])
    controller = confined(run, 'qa_control.py')
    # The controller validates all recorded process identities before terminating anything.
    for name in REVISIONS:
        session = json.loads((run/name/'session.json').read_text(encoding='utf-8'))
        if session['status'] == 'running':
            subprocess.run([sys.executable, str(controller), 'stop', name], check=True, cwd=repo)
            database = confined(run, f'{name}/review.db')
            verify_database(database, REVISIONS[name])
            (run/name/'review-state.json').write_text(json.dumps(database_fingerprint(database)), encoding='utf-8')
    if version is None:
        print('Owned review servers stopped. Saved review data preserved.')
        return
    database = confined(run, f'{version}/review.db')
    state_path = confined(run, f'{version}/review-state.json')
    state = json.loads(state_path.read_text(encoding='utf-8'))
    current = database_fingerprint(database)
    if current['databaseSha256'] != state['databaseSha256'] or current['walSha256'] != state.get('walSha256'):
        raise ValueError('Stopped review database changed outside this helper')
    verify_database(database, REVISIONS[version])
    if reset:
        backup = run/version/('review-before-reset-'+datetime.now().strftime('%Y%m%dT%H%M%S%f')+'.db')
        # Preserve user-entered review work before resetting the disposable copy.
        with closing(sqlite3.connect(database.as_uri()+'?mode=ro', uri=True)) as src, closing(sqlite3.connect(backup)) as dst:
            src.backup(dst)
        with closing(sqlite3.connect(database)) as db:
            if db.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()[0] != 0:
                raise ValueError('Database is still in use; reset refused')
        if any(Path(str(database)+suffix).exists() and Path(str(database)+suffix).stat().st_size for suffix in ['-wal','-journal']):
            raise ValueError('Uncheckpointed database; reset refused')
        candidate = database.with_suffix('.reset-candidate.db')
        if candidate.exists():
            raise ValueError('Previous reset candidate must be inspected first')
        shutil.copyfile(run/version/'review-seed.db', candidate)
        if digest(candidate) != digest(run/version/'review-seed.db'):
            raise ValueError('Reset copy hash mismatch')
        os.replace(candidate, database)
        state_path.write_text(json.dumps(database_fingerprint(database)), encoding='utf-8')
    subprocess.run([sys.executable, str(controller), 'start', version], check=True, cwd=repo)
    print(json.dumps({'version':version,'source':data['profiles'][version]['source_ref'],
                      'database':str(database),'url':'http://127.0.0.1:3035/mes'}))


def main() -> None:
    """The manifest hash must come from the committed review instructions."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version', choices=['baseline', 'integrated', 'stop', 'check'])
    parser.add_argument('--manifest-sha256', required=True)
    parser.add_argument('--reset', action='store_true')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    manifest = repo/RUN_RELATIVE/'review-manifest.json'
    if args.version == 'check':
        validate_manifest(repo, manifest, args.manifest_sha256)
        print('Sealed review inputs verified')
    else:
        run = confined(repo, RUN_RELATIVE.as_posix())
        if digest(manifest) != args.manifest_sha256:
            raise ValueError('Manifest identity mismatch')
        lock = confined(run, 'review-switch.lock')
        # Do not steal a stale or foreign lock; a failed prior switch needs inspection.
        with lock.open('x', encoding='utf-8') as handle:
            handle.write(str(os.getpid()))
        try:
            select_version(repo, manifest, args.manifest_sha256,
                           None if args.version == 'stop' else args.version, args.reset)
        finally:
            lock.unlink()


if __name__ == '__main__':
    main()
