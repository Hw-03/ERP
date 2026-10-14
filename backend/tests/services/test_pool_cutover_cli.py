"""The sandbox cutover command cannot default to a project DB or overwrite a recovery copy."""
import importlib.util
from pathlib import Path
import sqlite3

import pytest


def load_cli():
    path = Path(__file__).resolve().parents[3] / "scripts/ops/defect_pool_cutover.py"
    spec = importlib.util.spec_from_file_location("pool_cli", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_path_scope_and_existing_backup_are_protected(tmp_path):
    cli = load_cli()
    root = tmp_path / "sandbox"
    root.mkdir()
    source = root / "copy.db"
    with sqlite3.connect(source) as db:
        db.execute("CREATE TABLE evidence (quantity INTEGER)")
        db.execute("INSERT INTO evidence VALUES (7)")
    assert cli.sandbox_path(source, root) == source.resolve()
    with pytest.raises(ValueError):
        cli.sandbox_path(tmp_path / "outside.db", root)
    backup = root / "backup.db"
    cli.backup_copy(source, backup)
    with sqlite3.connect(backup) as db:
        assert db.execute("SELECT quantity FROM evidence").fetchone() == (7,)
    with pytest.raises(FileExistsError):
        cli.backup_copy(source, backup)


def test_apply_pin_prompt_uses_readonly_validation(db_session, monkeypatch):
    from app.models import SystemSetting
    from fastapi import HTTPException

    cli = load_cli()
    prompts = []
    monkeypatch.setattr(cli, "getpass", lambda prompt: prompts.append(prompt) or "0000", raising=False)
    cli.verify_apply_pin(db_session)
    assert len(prompts) == 1
    assert db_session.query(SystemSetting).count() == 0
    monkeypatch.setattr(cli, "getpass", lambda prompt: "invalid")
    with pytest.raises(HTTPException) as raised:
        cli.verify_apply_pin(db_session)
    assert raised.value.status_code == 403
    assert db_session.query(SystemSetting).count() == 0
