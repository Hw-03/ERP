"""승인된 부서 위치 정정을 개발 DB에만 적용한다. 기본 실행은 전체 롤백 검증이다."""

from __future__ import annotations

import argparse
from datetime import datetime
from decimal import Decimal
import json
from pathlib import Path
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "backend"))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import (
    DepartmentEnum, Employee, Inventory, InventoryLocation, InventoryOperation,
    InventoryOperationRoleEnum, Item, LocationStatusEnum, TransactionLog,
    TransactionTypeEnum,
)
from app.services import inventory as inventory_svc
from app.services import inventory_operations as operation_svc
from app.services import inv_effect

REFERENCE = "DEPT-CORRECTION-20260910-01"
MEMO = "여러 작업자의 부서 위치 지정 실수 정정"
MOVES = (
    ("34-AR-0738", "출하", "조립", 5),
    ("8-AR-0726", "출하", "조립", 20),
    ("8-HR-0027", "진공", "고압", 11),
    ("346-PR-0062", "조립", "출하", 18),
    ("34678-PR-0033", "조립", "출하", 20),
    ("34678-PR-0035", "조립", "출하", 2),
    ("34678-PR-0066", "조립", "출하", 1),
    ("3478-PR-0028", "조립", "출하", 60),
    ("6-PR-0029", "조립", "출하", 2),
    ("78-PR-0038", "조립", "출하", 29),
    ("8-PR-0376", "조립", "출하", 15),
    ("8-PR-0377", "조립", "출하", 15),
)


def correct(db: Session) -> list[dict]:
    """정확한 승인 수량을 검증하고 이동과 원장을 하나의 트랜잭션에 기록한다."""
    if db.query(TransactionLog).filter_by(reference_no=REFERENCE).first():
        raise ValueError("이미 적용된 정정입니다.")
    if db.query(InventoryOperation).filter_by(idempotency_key=REFERENCE).first():
        raise ValueError("이미 적용된 작업입니다.")
    actor = db.query(Employee).filter_by(name="김현우").one()
    items = {code: db.query(Item).filter_by(mes_code=code, deleted_at=None).one()
             for code, _, _, _ in MOVES}
    inventory_svc.ensure_and_lock_inventories(db, sorted(item.item_id for item in items.values()))
    for code, source, target, qty in MOVES:
        item = items[code]
        expected = {"AR": "조립", "HR": "고압", "PR": "출하"}[item.process_type_code]
        if target != expected:
            raise ValueError(f"{code}: 코드상 부서 불일치")
        location = db.query(InventoryLocation).filter_by(
            item_id=item.item_id, department=source, status=LocationStatusEnum.PRODUCTION,
        ).one()
        if int(location.quantity) != qty or int(location.pending_quantity or 0) != 0:
            raise ValueError(f"{code}: 승인 당시 수량 또는 예약 상태가 달라졌습니다.")
    operation = operation_svc.create_business_operation(
        db, domain="inventory", action="department_location_correction",
        display_label="부서 위치 조정", actor_name=actor.name,
        actor_employee_id=actor.employee_id, reason=MEMO, idempotency_key=REFERENCE,
    )
    if operation is None:
        raise ValueError("작업 원장이 활성화되어 있지 않습니다.")
    report = []
    for index, (code, source, target, qty) in enumerate(MOVES):
        item = items[code]
        inv = db.query(Inventory).filter_by(item_id=item.item_id).one()
        total = int(inv.quantity)
        before = inv_effect.snapshot_cells(db, item.item_id)
        inventory_svc.transfer_between_departments(
            db, item.item_id, Decimal(qty), DepartmentEnum(source), DepartmentEnum(target),
        )
        snapshot = inv_effect.capture_log_stock_snapshot(db, item.item_id, before)
        after = inv_effect.snapshot_cells(db, item.item_id)
        expected = dict(before)
        expected[("location", source, "PRODUCTION")] -= qty
        target_key = ("location", target, "PRODUCTION")
        expected[target_key] = expected.get(target_key, 0) + qty
        if {k: v for k, v in after.items() if v} != {k: v for k, v in expected.items() if v}:
            raise ValueError(f"{code}: 승인 대상 외 재고 변동")
        if int(inv.quantity) != total:
            raise ValueError(f"{code}: 총재고 변동")
        for effect in snapshot["inventory_effect"]:
            key = ("location", effect["department"], effect["status"])
            effect["quantity_before"] = before.get(key, 0)
            effect["quantity_after"] = after.get(key, 0)
        log = TransactionLog(
            item_id=item.item_id, transaction_type=TransactionTypeEnum.TRANSFER_DEPT,
            quantity_change=0, quantity_before=total, quantity_after=total,
            transfer_qty=qty, produced_by=actor.name, producer_employee_id=actor.employee_id,
            department=source, reference_no=REFERENCE, notes=MEMO,
            created_at=operation.effective_at, **snapshot,
        )
        role = InventoryOperationRoleEnum.PRIMARY if index == 0 else InventoryOperationRoleEnum.TRANSFER
        db.add(operation_svc.attach_transaction(log, operation, role))
        report.append(dict(code=code, source=source, target=target, quantity=qty,
                           total_before=total, total_after=int(inv.quantity),
                           effects=snapshot["inventory_effect"]))
    db.flush()
    logs = db.query(TransactionLog).filter_by(operation_id=operation.operation_id).all()
    if len(logs) != len(MOVES) or any(len(log.inventory_effect) != 2 for log in logs):
        raise ValueError("이동 원장 기록 불일치")
    return report


def main() -> None:
    """개발 DB 경로를 강제하고 백업·원자적 적용 또는 롤백 검증을 수행한다."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    db_path = Path(engine.url.database or "").resolve()
    if engine.dialect.name != "sqlite" or db_path != Path("C:/ERP/backend/mes.db").resolve():
        raise ValueError("이 스크립트는 C:/ERP 개발 DB 전용입니다.")
    output = ROOT / "_attic/runtime/reports" / REFERENCE
    output.mkdir(parents=True, exist_ok=True)
    if args.apply:
        backup = output / f"before-{datetime.now():%Y%m%d-%H%M%S}.db"
        with sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True) as source:
            with sqlite3.connect(backup) as destination:
                source.backup(destination)
        print(f"backup={backup}")
    with SessionLocal() as db:
        report = correct(db)
        if args.apply:
            db.commit()
        else:
            db.rollback()
    mode = "applied" if args.apply else "rehearsal-rolled-back"
    (output / f"{mode}.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8",
    )
    print(json.dumps(dict(mode=mode, reference=REFERENCE, moves=report), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
