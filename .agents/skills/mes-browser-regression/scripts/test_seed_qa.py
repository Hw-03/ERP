"""Exercise the real QA seeder against the current schema on a disposable database."""

import os
from pathlib import Path
import subprocess
import sys


def test_qa_seed_preserves_independent_roles_without_grades(tmp_path: Path) -> None:
    repo = Path(__file__).resolve().parents[4]
    database = tmp_path / "qa.db"
    workspace_backend = tmp_path / "workspace" / "backend"
    workspace_backend.mkdir(parents=True)
    environment = {**os.environ, "DATABASE_URL": f"sqlite:///{database.as_posix()}", "PYTHONUTF8": "1"}
    code = """
import importlib.util, sys
sys.path.insert(0, sys.argv[1])
from app.database import Base, engine, SessionLocal
from app.models import Employee
Base.metadata.create_all(engine)
spec = importlib.util.spec_from_file_location('qa_seed', sys.argv[2])
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
sys.argv = [sys.argv[2], sys.argv[3], sys.argv[4]]
module.main()
with SessionLocal() as session:
    employees = {employee.employee_code: employee for employee in session.query(Employee)}
    assert set(employees) == {'QA-ADMIN', 'QA-WH', 'QA-ASM'}
    assert employees['QA-WH'].warehouse_role == 'primary'
    assert employees['QA-ASM'].warehouse_role == 'none'
    assert 'level' not in Employee.__table__.columns
"""
    result = subprocess.run([sys.executable, "-X", "utf8", "-c", code, str(repo / "backend"),
                             str(Path(__file__).with_name("seed_qa.py")), str(database), str(workspace_backend)],
                            env=environment, capture_output=True, text=True, encoding="utf-8", timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
