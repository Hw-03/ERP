from __future__ import annotations

import importlib.util
import sys
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "dev" / "replenish_department_safety_stock.py"


def _load_subject():
    spec = importlib.util.spec_from_file_location("replenish_department_safety_stock", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError("Could not load replenishment script")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(spec.name, None)
    return module


def test_plan_replenishes_only_single_department_items_below_minimum() -> None:
    subject = _load_subject()
    rows = (
        subject.DepartmentStock("item-1", "A-AR-0001", 200, 250, "assembly", 1),
        subject.DepartmentStock("item-2", "A-AR-0002", 0, 150, "assembly", 1),
        subject.DepartmentStock("item-3", "A-AR-0003", 0, 50, "vacuum", 2),
        subject.DepartmentStock("item-4", "A-AR-0004", 200, 0, None, 0),
    )

    plan = subject.plan_replenishment(rows)

    assert [(target.item_id, target.target_quantity, target.increase_quantity) for target in plan.targets] == [
        ("item-1", 300, 50)
    ]
    assert plan.total_increase == 50
    assert plan.skipped_above_or_at_target == 1
    assert plan.skipped_multiple_departments == 1
    assert plan.skipped_without_department == 1
