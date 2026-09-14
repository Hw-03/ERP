from __future__ import annotations

from types import SimpleNamespace

from app.models import InventoryOperationRoleEnum, TransactionTypeEnum
from app.services.weekly_report_contract import classify_inventory_activity


def _log(
    tx_type: TransactionTypeEnum,
    *,
    role: InventoryOperationRoleEnum,
    quantity_change: int,
    effects: list[dict],
    shipping_phase: str | None = None,
):
    return SimpleNamespace(
        transaction_type=tx_type,
        operation_role=role,
        quantity_change=quantity_change,
        inventory_effect=effects,
        shipping_phase=shipping_phase,
    )


def test_normal_rework_parent_is_defect_only() -> None:
    activity = classify_inventory_activity(
        _log(
            TransactionTypeEnum.DISASSEMBLE,
            role=InventoryOperationRoleEnum.REWORK_PARENT_NORMAL,
            quantity_change=-1,
            effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": -1}],
        )
    )

    assert activity.as_tuple() == (0, 0, 0, 1)
    assert activity.normal_delta == -1


def test_defective_rework_parent_is_not_counted_again() -> None:
    activity = classify_inventory_activity(
        _log(
            TransactionTypeEnum.DISASSEMBLE,
            role=InventoryOperationRoleEnum.REWORK_PARENT_DEFECTIVE,
            quantity_change=-1,
            effects=[{"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": -1}],
        )
    )

    assert activity.as_tuple() == (0, 0, 0, 0)
    assert activity.normal_delta == 0


def test_rework_defective_and_scrap_children_are_receive_and_defect() -> None:
    defective = classify_inventory_activity(
        _log(
            TransactionTypeEnum.MARK_DEFECTIVE,
            role=InventoryOperationRoleEnum.REWORK_CHILD_DEFECTIVE,
            quantity_change=2,
            effects=[{"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": 2}],
        )
    )
    scrap = classify_inventory_activity(
        _log(
            TransactionTypeEnum.DEFECT_SCRAP,
            role=InventoryOperationRoleEnum.REWORK_CHILD_SCRAP,
            quantity_change=-3,
            effects=[],
        )
    )

    assert defective.as_tuple() == (0, 2, 0, 2)
    assert scrap.as_tuple() == (0, 3, 0, 3)
    assert defective.normal_delta == 0
    assert scrap.normal_delta == 0


def test_quarantine_restore_and_existing_defect_scrap_follow_normal_stock() -> None:
    quarantine = classify_inventory_activity(
        _log(
            TransactionTypeEnum.MARK_DEFECTIVE,
            role=InventoryOperationRoleEnum.PRIMARY,
            quantity_change=0,
            effects=[
                {"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": -4},
                {"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": 4},
            ],
        )
    )
    restore = classify_inventory_activity(
        _log(
            TransactionTypeEnum.UNMARK_DEFECTIVE,
            role=InventoryOperationRoleEnum.PRIMARY,
            quantity_change=0,
            effects=[
                {"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": -2},
                {"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": 2},
            ],
        )
    )
    old_defect_scrap = classify_inventory_activity(
        _log(
            TransactionTypeEnum.DEFECT_SCRAP,
            role=InventoryOperationRoleEnum.PRIMARY,
            quantity_change=-1,
            effects=[{"scope": "location", "department": "진공", "status": "DEFECTIVE", "delta": -1}],
        )
    )

    assert quarantine.as_tuple() == (0, 0, 0, 4)
    assert restore.as_tuple() == (0, 2, 0, 0)
    assert old_defect_scrap.as_tuple() == (0, 0, 0, 0)


def test_production_shipping_and_normal_scrap_have_nonnegative_columns() -> None:
    production = classify_inventory_activity(
        _log(
            TransactionTypeEnum.PRODUCE,
            role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
            quantity_change=5,
            effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": 5}],
        )
    )
    shipping = classify_inventory_activity(
        _log(
            TransactionTypeEnum.SHIP,
            role=InventoryOperationRoleEnum.PRIMARY,
            quantity_change=-3,
            effects=[{"scope": "location", "department": "출하", "status": "PRODUCTION", "delta": -3}],
        )
    )
    normal_scrap = classify_inventory_activity(
        _log(
            TransactionTypeEnum.DEFECT_SCRAP,
            role=InventoryOperationRoleEnum.PRIMARY,
            quantity_change=-2,
            effects=[{"scope": "warehouse", "delta": -2}],
        )
    )

    assert production.as_tuple() == (5, 0, 0, 0)
    assert shipping.as_tuple() == (0, 0, 3, 0)
    assert normal_scrap.as_tuple() == (0, 0, 0, 2)


def test_component_change_target_is_receive_and_source_is_out() -> None:
    target = classify_inventory_activity(
        _log(
            TransactionTypeEnum.PRODUCE,
            role=InventoryOperationRoleEnum.PRODUCT_OUTPUT,
            quantity_change=1,
            effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": 1}],
            shipping_phase="COMPONENT_CHANGE",
        )
    )
    source = classify_inventory_activity(
        _log(
            TransactionTypeEnum.BACKFLUSH,
            role=InventoryOperationRoleEnum.COMPONENT_INPUT,
            quantity_change=-1,
            effects=[{"scope": "location", "department": "진공", "status": "PRODUCTION", "delta": -1}],
            shipping_phase="COMPONENT_CHANGE",
        )
    )

    assert target.as_tuple() == (0, 1, 0, 0)
    assert target.normal_delta == 1
    assert source.as_tuple() == (0, 0, 1, 0)
    assert source.normal_delta == -1
