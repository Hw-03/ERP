"""Resolve a physical inventory location without using its mutable name as identity."""

from __future__ import annotations

from dataclasses import dataclass
from collections.abc import Iterable

from app.models import Department


WAREHOUSE_SCOPE_KEY = "warehouse"
WAREHOUSE_PHYSICAL_DEPARTMENT = "창고"


@dataclass(frozen=True)
class ScopeDescriptor:
    scope_key: str
    department_id: int | None
    physical_department: str


def describe_scope(department: Department | None) -> ScopeDescriptor:
    """Map the warehouse or a persisted department PK to one canonical cell."""
    if department is None:
        return ScopeDescriptor(WAREHOUSE_SCOPE_KEY, None, WAREHOUSE_PHYSICAL_DEPARTMENT)
    if department.id is None:
        raise ValueError("A department must have a persisted ID before scope mapping")
    if department.name == WAREHOUSE_PHYSICAL_DEPARTMENT:
        return ScopeDescriptor(WAREHOUSE_SCOPE_KEY, department.id, WAREHOUSE_PHYSICAL_DEPARTMENT)
    return ScopeDescriptor(f"department:{department.id}", department.id, department.name)


def plan_scopes(
    departments: Iterable[Department],
    physical_departments: Iterable[str],
) -> list[ScopeDescriptor]:
    """Produce a read-only canonical map, failing if any physical cell lacks an owner."""
    ordered = list(departments)
    if any(department.id is None for department in ordered):
        raise ValueError("Every department needs a persisted ID")
    ordered.sort(key=lambda department: department.id)
    warehouse_alias = [department for department in ordered if department.name == WAREHOUSE_PHYSICAL_DEPARTMENT]
    if len(warehouse_alias) > 1:
        raise ValueError("Multiple warehouse department aliases")
    descriptors = [
        describe_scope(warehouse_alias[0]) if warehouse_alias else describe_scope(None),
        *(describe_scope(department) for department in ordered if department.name != WAREHOUSE_PHYSICAL_DEPARTMENT),
    ]
    by_name = {descriptor.physical_department: descriptor for descriptor in descriptors}
    if len(by_name) != len(descriptors):
        raise ValueError("Multiple scopes share one physical department name")
    unknown = sorted(set(physical_departments) - set(by_name))
    if unknown:
        raise ValueError("Unmapped physical departments: " + ", ".join(unknown))
    return descriptors
