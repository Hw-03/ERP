"""Replace bootstrap employee names with synthetic actors in a guarded fresh QA DB."""
from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path
import sys
from zoneinfo import ZoneInfo


def main() -> None:
    """Fixture writes are confined to the session's qa.db, before server startup."""
    db = Path(sys.argv[1]).resolve()
    backend = Path(sys.argv[2]).resolve()
    if db.name != "qa.db" or backend != db.parent / "workspace/backend" or os.environ.get("DATABASE_URL") != f"sqlite:///{db.as_posix()}":
        raise ValueError("QA fixture path mismatch")
    sys.path.insert(0, str(backend))
    from app.database import SessionLocal
    from app.models import Employee, EmployeeAssignedModel, SystemSetting, WeeklyInventorySnapshot

    with SessionLocal() as session:
        session.query(EmployeeAssignedModel).delete()
        session.query(Employee).delete()
        for code, department in [("QA-ADMIN", "관리"), ("QA-WH", "창고"), ("QA-ASM", "조립")]:
            session.add(Employee(employee_code=code, name=code, role="QA", department=department,
                                 warehouse_role="primary" if code != "QA-ASM" else "none", department_role="primary"))
        session.merge(SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2000-01-01T00:00:00"))
        today = datetime.now(ZoneInfo("Asia/Seoul")).date()
        week_start = today - timedelta(days=today.weekday())
        session.merge(SystemSetting(setting_key="weekly_report_v2_starts_at", setting_value=f"{week_start.isoformat()}T00:00:00+09:00"))
        session.add(WeeklyInventorySnapshot(
            week_end=week_start - timedelta(days=1), as_of_utc=datetime.utcnow(),
            capture_source="qa_regression", basis_version=2, item_count=0, total_quantity=0,
            normal_total_quantity=0, defective_total_quantity=0,
        ))
        session.commit()


if __name__ == "__main__":
    main()
