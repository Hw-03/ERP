"""Public code installation must preserve data and its recovery boundary."""
import json
from pathlib import Path
import sys
import subprocess

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from scripts.ops import employee_frontend_release as release


def _fixture(tmp_path):
    source, employee = tmp_path / 'source', tmp_path / 'employee'
    for root in (source, employee):
        for name in ('backend', 'scripts'):
            (root / name).mkdir(parents=True)
            (root / name / 'code.py').write_text(root.name)
    (employee / 'backend/mes.db').write_bytes(b'employee database')
    (employee / 'backend/.env').write_bytes(b'employee settings')
    (employee / 'backend/obsolete.py').write_text('old')
    recovery = employee / '_attic/runtime/frontend-releases/test'
    recovery.mkdir(parents=True)
    backups = {}
    for name in ('backend', 'scripts'):
        backups[name] = release.files(employee / name, source=True)
        release._copy_files(employee / name, recovery / ('old-' + name), backups[name])
    record = recovery / 'journal.json'
    record.write_text(json.dumps({'employee_root': str(employee), 'phase': 'INSTALLED',
                                 'code_backups': backups, 'config_existed': False}))
    manifest = release.snapshot_code(source, tmp_path / 'manifests')
    return source, employee, record, manifest


def test_public_code_install_preserves_database_and_can_roll_back(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    release.verify_code(employee, manifest)
    assert (employee / 'backend/mes.db').read_bytes() == b'employee database'
    assert (employee / 'backend/.env').read_bytes() == b'employee settings'
    assert not (employee / 'backend/obsolete.py').exists()
    release.rollback(record, employee)
    assert (employee / 'backend/code.py').read_text() == 'employee'
    assert (employee / 'backend/obsolete.py').read_text() == 'old'
    assert (employee / 'backend/mes.db').read_bytes() == b'employee database'


def test_public_code_install_rejects_source_drift_before_mutation(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    (source / 'backend/code.py').write_text('changed after verification')
    with pytest.raises(release.ReleaseError):
        release.install_code(source, record, employee, manifest)
    assert (employee / 'backend/code.py').read_text() == 'employee'


def test_public_code_install_rejects_migration_boundary(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    journal = json.loads(record.read_text())
    journal['phase'] = 'MIGRATING'
    record.write_text(json.dumps(journal))
    with pytest.raises(release.ReleaseError):
        release.install_code(source, record, employee, manifest)
    assert (employee / 'backend/code.py').read_text() == 'employee'


def test_public_code_install_failure_restores_code_without_restoring_data(tmp_path, monkeypatch):
    source, employee, record, manifest = _fixture(tmp_path)
    original = release._copy_files

    def fail_incoming_scripts(origin, destination, files):
        if origin == source / 'scripts':
            raise OSError('simulated installation failure')
        return original(origin, destination, files)

    monkeypatch.setattr(release, '_copy_files', fail_incoming_scripts)
    with pytest.raises(OSError, match='simulated'):
        release.install_code(source, record, employee, manifest)
    assert json.loads(record.read_text())['phase'] == 'ROLLED_BACK'
    assert (employee / 'backend/code.py').read_text() == 'employee'
    assert (employee / 'backend/obsolete.py').read_text() == 'old'
    assert (employee / 'backend/mes.db').read_bytes() == b'employee database'


def test_public_code_install_rejects_employee_drift_before_mutation(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    (employee / 'scripts/code.py').write_text('another deployment')
    with pytest.raises(release.ReleaseError, match='changed after'):
        release.install_code(source, record, employee, manifest)
    assert (employee / 'backend/code.py').read_text() == 'employee'


def test_public_code_install_rejects_root_launcher_drift(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    journal = json.loads(record.read_text())
    journal['root_files'] = {'start.bat': None}
    record.write_text(json.dumps(journal))
    (employee / 'start.bat').write_text('another deployment launcher')
    with pytest.raises(release.ReleaseError, match='launcher'):
        release.install_code(source, record, employee, manifest)
    assert (employee / 'backend/code.py').read_text() == 'employee'


def test_begin_cutover_requires_verified_admission_before_migration(tmp_path, monkeypatch):
    from scripts.ops import friday_profile_cutover as cutover
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)

    def reject(**kwargs):
        raise cutover.CutoverAdmissionError('stale data')

    monkeypatch.setattr(cutover, 'verify_admission', reject)
    with pytest.raises(cutover.CutoverAdmissionError, match='stale'):
        release.begin_friday_cutover(record, employee, tmp_path / 'admission.json',
                                     'a' * 64, tmp_path / 'candidate.db', tmp_path / 'original.db')
    assert json.loads(record.read_text())['phase'] == 'INSTALLED'


def test_verified_database_recovery_allows_code_rollback(tmp_path, monkeypatch):
    from scripts.ops import friday_profile_cutover as cutover
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    monkeypatch.setattr(cutover, 'verify_admission', lambda **kwargs: {'status': 'PASS'})
    release.begin_friday_cutover(record, employee, tmp_path / 'admission.json',
                                 'a' * 64, tmp_path / 'candidate.db', tmp_path / 'original.db')
    assert json.loads(record.read_text())['phase'] == 'MIGRATING'
    calls = []
    monkeypatch.setattr(cutover, 'verify_recovery_receipt', lambda **kwargs: calls.append(kwargs) or {'status': 'PASS'})
    release.rollback(record, employee, recovery_receipt=tmp_path / 'recovery.json', recovery_sha256='b' * 64)
    assert calls[0]['target_path'] == employee / 'backend/mes.db'
    assert calls[0]['expected_cutover_receipt_sha256'] == 'a' * 64
    assert (employee / 'backend/code.py').read_text() == 'employee'
    assert json.loads(record.read_text())['phase'] == 'ROLLED_BACK'


def test_invalid_database_recovery_keeps_code_and_services_boundary(tmp_path, monkeypatch):
    from scripts.ops import friday_profile_cutover as cutover
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    monkeypatch.setattr(cutover, 'verify_admission', lambda **kwargs: {'status': 'PASS'})
    release.begin_friday_cutover(record, employee, tmp_path / 'admission.json',
                                 'a' * 64, tmp_path / 'candidate.db', tmp_path / 'original.db')

    def reject(**kwargs):
        raise cutover.CutoverAdmissionError('new employee writes')

    monkeypatch.setattr(cutover, 'verify_recovery_receipt', reject)
    with pytest.raises(cutover.CutoverAdmissionError, match='new employee writes'):
        release.rollback(record, employee, recovery_receipt=tmp_path / 'recovery.json', recovery_sha256='b' * 64)
    assert (employee / 'backend/code.py').read_text() == 'source'
    assert json.loads(record.read_text())['phase'] == 'MIGRATING'


def test_raw_migration_cannot_bypass_installed_code_admission(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    with pytest.raises(release.ReleaseError, match='Friday'):
        release.mark(record, employee, 'MIGRATING')
    assert json.loads(record.read_text())['phase'] == 'INSTALLED'


def test_confirm_requires_friday_binding_for_full_code_install(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    journal = json.loads(record.read_text())
    journal['phase'] = 'MIGRATING'
    record.write_text(json.dumps(journal))
    with pytest.raises(release.ReleaseError, match='Friday'):
        release.mark(record, employee, 'CONFIRMED')


def test_ordinary_frontend_release_retains_existing_phase_contract(tmp_path):
    _, employee, record, _ = _fixture(tmp_path)
    release.mark(record, employee, 'MIGRATING')
    release.mark(record, employee, 'CONFIRMED')
    assert json.loads(record.read_text())['phase'] == 'CONFIRMED'


def test_admission_cli_failure_uses_blocked_contract(tmp_path):
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    admission = tmp_path / 'admission.json'
    admission.write_text('{}')
    result = subprocess.run([
        sys.executable, str(Path(release.__file__)), 'begin-friday-cutover',
        '--record', str(record), '--employee-root', str(employee),
        '--admission', str(admission), '--admission-sha256', 'a' * 64,
        '--candidate', str(tmp_path / 'candidate.db'), '--original', str(tmp_path / 'original.db'),
    ], capture_output=True, text=True)
    assert result.returncode == 9
    assert 'FRONTEND_PREPARE_RESULT=BLOCKED' in result.stderr
    assert 'Traceback' not in result.stderr
    assert json.loads(record.read_text())['phase'] == 'INSTALLED'


def test_bound_confirmation_checks_installed_friday_data(tmp_path, monkeypatch):
    from scripts.ops import friday_profile_cutover as cutover
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    calls = []
    monkeypatch.setattr(cutover, 'verify_admission', lambda **kwargs: calls.append(kwargs) or {})
    admission, candidate, original = (tmp_path / name for name in ('admission.json', 'candidate.db', 'original.db'))
    release.begin_friday_cutover(record, employee, admission, 'a' * 64, candidate, original)
    release.mark(record, employee, 'CONFIRMED')
    assert calls[-1] == dict(receipt_path=admission, expected_receipt_sha256='a' * 64,
                            candidate_path=candidate, original_path=original,
                            target_path=employee / 'backend/mes.db', friday_validator_root=employee,
                            recovery=True)
    assert json.loads(record.read_text())['phase'] == 'CONFIRMED'


def test_bound_confirmation_rejects_verifier_failure_and_code_drift(tmp_path, monkeypatch):
    from scripts.ops import friday_profile_cutover as cutover
    source, employee, record, manifest = _fixture(tmp_path)
    release.install_code(source, record, employee, manifest)
    monkeypatch.setattr(cutover, 'verify_admission', lambda **kwargs: {})
    release.begin_friday_cutover(record, employee, tmp_path / 'admission.json',
                                 'a' * 64, tmp_path / 'candidate.db', tmp_path / 'original.db')

    def reject(**kwargs):
        raise cutover.CutoverAdmissionError('new database writes')

    monkeypatch.setattr(cutover, 'verify_admission', reject)
    with pytest.raises(cutover.CutoverAdmissionError, match='new database writes'):
        release.mark(record, employee, 'CONFIRMED')
    assert json.loads(record.read_text())['phase'] == 'MIGRATING'
    (employee / 'backend/code.py').write_text('unreviewed change')
    with pytest.raises(release.ReleaseError, match='code changed'):
        release.mark(record, employee, 'CONFIRMED')
    assert json.loads(record.read_text())['phase'] == 'MIGRATING'
