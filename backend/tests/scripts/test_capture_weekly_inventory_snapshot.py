"""주간 재고 스냅샷 예약 실행 명령 테스트."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from types import SimpleNamespace


SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "capture_weekly_inventory_snapshot.py"
REGISTER_SCRIPT = (
    Path(__file__).resolve().parents[3]
    / "scripts"
    / "ops"
    / "register-weekly-inventory-snapshot.ps1"
)


def _load_module():
    spec = importlib.util.spec_from_file_location("capture_weekly_inventory_snapshot", SCRIPT)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class _FakeSession:
    def __enter__(self):
        return self

    def __exit__(self, _exc_type, _exc, _tb):
        return False


def test_capture_command_reports_confirmed_week(monkeypatch, capsys):
    module = _load_module()
    snapshot = SimpleNamespace(
        week_end=SimpleNamespace(isoformat=lambda: "2026-05-03"),
        item_count=117,
        total_quantity=1591,
        capture_source="scheduled",
    )
    monkeypatch.setattr(module, "SessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(
        module,
        "ensure_due_snapshot_committed",
        lambda _db, *, source: snapshot if source == "scheduled" else None,
    )

    exit_code = module.main()

    assert exit_code == 0
    output = capsys.readouterr().out
    assert "week_end=2026-05-03" in output
    assert "items=117" in output
    assert "total=1591" in output


def test_registration_script_pins_monday_midnight_kst_and_python_command():
    source = REGISTER_SCRIPT.read_text(encoding="utf-8")

    assert '"Korea Standard Time"' in source
    assert "-DaysOfWeek Monday" in source
    assert "-At \"00:00\"" in source
    assert "capture_weekly_inventory_snapshot.py" in source
    assert "-StartWhenAvailable" in source
