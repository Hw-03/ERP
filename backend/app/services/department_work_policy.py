"""Reject new department work while preserving historical cancellation/recovery."""
from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import Department, DepartmentEnum


def validate_active_department_cells(db: Session, cells: Iterable[tuple[str, str | None]]) -> None:
    """Call at new submission boundaries, never during reversal of historical work."""
    names = set()
    for bucket, department in cells:
        if bucket == "warehouse":
            names.add(DepartmentEnum.WAREHOUSE.value)
        elif bucket in {"production", "defective"} and department:
            names.add(str(getattr(department, "value", department)))
    inactive = db.query(Department.name).filter(Department.name.in_(names), Department.is_active.is_(False)).all()
    if inactive:
        raise ValueError("사용 중지된 부서에는 새 업무를 제출할 수 없습니다: " + ", ".join(sorted(name for (name,) in inactive)))
