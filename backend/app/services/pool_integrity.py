"""Read-only POOL diagnostics; frozen occurrence balances are historical evidence."""

from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (DefectStockMovement, DefectStockPool, InventoryLocation,
                        InventoryScope, LocationStatusEnum, StockRequest,
                        StockRequestLine, StockRequestStatusEnum, RequestBucketEnum)
from app.schemas.inventory_integrity import InventoryIntegrityIssue


def stock_issues(db: Session) -> list[InventoryIntegrityIssue]:
    """Compare physical, category, reservation owners, and append-only movements."""
    from app.services.inventory_integrity import _issue

    issues = []
    projected = defaultdict(lambda: [0, 0])
    physical = {(str(row.item_id), str(row.department)): [int(row.quantity), int(row.pending_quantity)]
                for row in db.query(InventoryLocation).filter_by(status=LocationStatusEnum.DEFECTIVE).all()}
    reservations = dict(db.query(StockRequestLine.pool_id, func.sum(StockRequestLine.quantity)).join(
        StockRequest, StockRequest.request_id == StockRequestLine.request_id,
    ).filter(StockRequestLine.from_bucket == RequestBucketEnum.DEFECTIVE,
             StockRequest.status == StockRequestStatusEnum.RESERVED,
             StockRequestLine.status == StockRequestStatusEnum.RESERVED).group_by(StockRequestLine.pool_id).all())

    def mismatch(identity: tuple, current: str, expected: str) -> None:
        issues.append(_issue(category="DEFECT_STOCK_MISMATCH", identity=identity,
            title="공동재고 정합성 불일치", description="물리 수량·분류·이동·예약 증빙을 확인해야 합니다.",
            cause_ids=identity, current_value=current, expected_value=expected, repairable=False))

    for pool, scope in db.query(DefectStockPool, InventoryScope).join(
        InventoryScope, InventoryScope.scope_key == DefectStockPool.scope_key,
    ).all():
        cell = (str(pool.item_id), scope.physical_department)
        projected[cell][0] += int(pool.quantity)
        projected[cell][1] += int(pool.pending_quantity)
        owner_total = int(reservations.pop(pool.pool_id, 0))
        if owner_total != int(pool.pending_quantity):
            mismatch((str(pool.pool_id), "reservation"), str(pool.pending_quantity), str(owner_total))
        movements = db.query(DefectStockMovement).filter_by(pool_id=pool.pool_id).order_by(
            DefectStockMovement.created_at, DefectStockMovement.movement_id,
        ).all()
        # Opening stock must be a 0→opening movement in the cutover operation (2-C).
        total = sum(int(row.delta) for row in movements)
        if total != int(pool.quantity):
            mismatch((str(pool.pool_id), "movement"), str(pool.quantity), str(total))
        if any(int(row.before_quantity) + int(row.delta) != int(row.after_quantity) for row in movements):
            mismatch((str(pool.pool_id), "movement-arithmetic"), "효과 산술 불일치", "before + delta = after")
    for pool_id, quantity in reservations.items():
        if quantity:
            mismatch((str(pool_id), "missing-pool"), str(quantity), "유효한 공동재고 예약 소유자")
    for cell in sorted(set(physical) | set(projected)):
        if physical.get(cell, [0, 0]) != projected.get(cell, [0, 0]):
            mismatch((*cell, "physical"), str(physical.get(cell, [0, 0])), str(projected.get(cell, [0, 0])))
    return issues
