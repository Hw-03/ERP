"""복원 출처와 FIFO 할당 원장의 ORM 계약 테스트."""

from __future__ import annotations

from decimal import Decimal

import app.models as models


def test_reconstruction_models_preserve_parent_source_and_fifo_allocation(
    db_session,
    make_item,
) -> None:
    assert hasattr(models, "DefectQuarantineReconstruction")
    assert hasattr(models, "DefectQuarantineReconstructionAllocation")

    reconstruction_type = models.DefectQuarantineReconstruction
    allocation_type = models.DefectQuarantineReconstructionAllocation
    item = make_item(name="복원 원장 품목", warehouse_qty=Decimal("0"))
    parent = models.DefectQuarantineRecord(
        item_id=item.item_id,
        department=models.DepartmentEnum.ASSEMBLY.value,
        original_quantity=Decimal("3"),
        remaining_quantity=Decimal("0"),
        is_legacy=True,
    )
    child = models.DefectQuarantineRecord(
        item_id=item.item_id,
        department=models.DepartmentEnum.ASSEMBLY.value,
        original_quantity=Decimal("2"),
        remaining_quantity=Decimal("1"),
        is_legacy=True,
    )
    db_session.add_all([parent, child])
    db_session.flush()

    source_log = models.TransactionLog(
        item_id=item.item_id,
        transaction_type=models.TransactionTypeEnum.MARK_DEFECTIVE,
        quantity_change=Decimal("2"),
        department=models.DepartmentEnum.ASSEMBLY.value,
        defect_quarantine_record_id=child.record_id,
        inventory_effect=[
            {
                "scope": "location",
                "department": models.DepartmentEnum.ASSEMBLY.value,
                "status": models.LocationStatusEnum.DEFECTIVE.value,
                "delta": 2,
            }
        ],
    )
    outgoing_log = models.TransactionLog(
        item_id=item.item_id,
        transaction_type=models.TransactionTypeEnum.UNMARK_DEFECTIVE,
        quantity_change=Decimal("-1"),
        department=models.DepartmentEnum.ASSEMBLY.value,
        inventory_effect=[
            {
                "scope": "location",
                "department": models.DepartmentEnum.ASSEMBLY.value,
                "status": models.LocationStatusEnum.DEFECTIVE.value,
                "delta": -1,
            }
        ],
    )
    db_session.add_all([source_log, outgoing_log])
    db_session.flush()
    db_session.add(
        reconstruction_type(
            child_record_id=child.record_id,
            parent_record_id=parent.record_id,
            source_transaction_log_id=source_log.log_id,
        )
    )
    db_session.add(
        allocation_type(
            transaction_log_id=outgoing_log.log_id,
            record_id=child.record_id,
            quantity=Decimal("1"),
        )
    )
    db_session.flush()

    reconstruction = db_session.get(reconstruction_type, child.record_id)
    allocation = db_session.query(allocation_type).one()

    assert reconstruction.parent_record_id == parent.record_id
    assert reconstruction.source_transaction_log_id == source_log.log_id
    assert allocation.record_id == child.record_id
    assert allocation.transaction_log_id == outgoing_log.log_id
    assert allocation.quantity == Decimal("1")
