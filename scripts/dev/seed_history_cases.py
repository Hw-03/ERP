#!/usr/bin/env python3
"""우측 상세 카드 15 시각 케이스 시드 스크립트 (phase4 검수 전용).

phase4 우측 카드 재정비 직후, MCP 수동 클릭 대신 한 번 실행으로
15개 거래 케이스를 DB 에 시드한다.

낱개 9건: RECEIVE / SHIP / TRANSFER_TO_PROD / TRANSFER_TO_WH /
         TRANSFER_DEPT / ADJUST+ / ADJUST- / MARK_DEFECTIVE / SUPPLIER_RETURN
묶음 6건: PRODUCE BOM / DISASSEMBLE BOM / BACKFLUSH 단일 /
         PRODUCE BOM(제외 자식 포함) / ADJUST+ + 수정 이력 / legacy(batch null)

실행: python scripts/dev/seed_history_cases.py
"""

from __future__ import annotations

import datetime
import json
import sys
import uuid
from decimal import Decimal
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BACKEND_DIR / ".env")

from app.database import SessionLocal, engine  # noqa: E402

# 다른 세션의 queue 도메인 삭제 작업이 transaction_logs.batch_id FK 가 참조하는
# queue_batches 테이블을 drop 했지만 transaction_logs 의 DDL 에는 그대로 잔재.
# SQLite 가 NULL FK 도 referenced 테이블 존재를 검사하므로 빈 stub 추가.
import sqlite3 as _sqlite3  # noqa: E402
def _ensure_queue_batches_stub():
    if engine.url.drivername.startswith("sqlite"):
        con = _sqlite3.connect(engine.url.database)
        con.execute("CREATE TABLE IF NOT EXISTS queue_batches (batch_id TEXT PRIMARY KEY)")
        con.commit()
        con.close()
_ensure_queue_batches_stub()
from app.models import (  # noqa: E402
    Employee,
    IoBatch,
    IoBundle,
    IoLine,
    Item,
    TransactionEditLog,
    TransactionLog,
    TransactionTypeEnum,
)


MARKER = f"HISTORY-CASES-{datetime.datetime.utcnow():%Y%m%d%H%M%S}"


def _notes(case_no: int, label: str) -> str:
    return f"{MARKER} / CASE-{case_no:02d} {label}"


def _pick_items(db):
    items = (
        db.query(Item)
        .order_by(Item.sort_order.asc().nullslast(), Item.item_name)
        .limit(8)
        .all()
    )
    if len(items) < 5:
        raise RuntimeError(
            f"Item 시드 부족 (현재 {len(items)}개) — bootstrap_db.py 먼저 실행 필요"
        )
    return {
        "single": items[0],
        "single2": items[1],
        "parent": items[2],
        "children": items[3:7],
    }


def _pick_employee(db):
    emp = (
        db.query(Employee)
        .order_by(Employee.display_order, Employee.name)
        .first()
    )
    if emp is None:
        raise RuntimeError("Employee 시드 부족 — bootstrap_db.py 먼저")
    return emp


def _new_batch(
    db,
    *,
    emp,
    sub_type: str,
    from_dept: str | None = None,
    to_dept: str | None = None,
    work_type: str = "process",
) -> IoBatch:
    batch = IoBatch(
        work_type=work_type,
        sub_type=sub_type,
        status="completed",
        requester_employee_id=emp.employee_id,
        requester_name=emp.name,
        requester_department=emp.department,
        from_department=from_dept,
        to_department=to_dept,
        completed_at=datetime.datetime.utcnow(),
    )
    db.add(batch)
    db.flush()
    return batch


def _new_bundle(
    db,
    *,
    batch: IoBatch,
    item: Item,
    quantity: Decimal,
    source_kind: str = "single",
) -> IoBundle:
    bundle = IoBundle(
        batch_id=batch.batch_id,
        source_kind=source_kind,
        source_item_id=item.item_id,
        title_snapshot=item.item_name,
        quantity=quantity,
        expanded_level=1,
    )
    db.add(bundle)
    db.flush()
    return bundle


def _new_line(
    db,
    *,
    bundle: IoBundle,
    item: Item,
    direction: str,
    from_bucket: str,
    to_bucket: str,
    quantity: Decimal,
    origin: str = "direct",
    included: bool = True,
    from_dept: str | None = None,
    to_dept: str | None = None,
) -> IoLine:
    line = IoLine(
        bundle_id=bundle.bundle_id,
        item_id=item.item_id,
        item_name_snapshot=item.item_name,
        erp_code_snapshot=item.erp_code,
        unit=item.unit or "EA",
        direction=direction,
        from_bucket=from_bucket,
        from_department=from_dept,
        to_bucket=to_bucket,
        to_department=to_dept,
        quantity=quantity,
        origin=origin,
        included=included,
    )
    db.add(line)
    db.flush()
    return line


def _new_log(
    db,
    *,
    item: Item,
    tx: TransactionTypeEnum,
    qty: Decimal,
    notes: str,
    batch: IoBatch | None = None,
    before: Decimal | None = None,
    after: Decimal | None = None,
    transfer_qty: Decimal | None = None,
) -> TransactionLog:
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=tx,
        quantity_change=qty,
        quantity_before=before,
        quantity_after=after,
        transfer_qty=transfer_qty,
        notes=notes,
        operation_batch_id=batch.batch_id if batch else None,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(log)
    db.flush()
    return log


def main() -> int:
    with SessionLocal() as db:
        items = _pick_items(db)
        emp = _pick_employee(db)
        single = items["single"]
        single2 = items["single2"]
        parent = items["parent"]
        children = items["children"]
        D = Decimal

        # 1. RECEIVE — 원자재 입고
        b1 = _new_batch(db, emp=emp, sub_type="receive_supplier", to_dept="조립")
        bu1 = _new_bundle(db, batch=b1, item=single, quantity=D("5"))
        _new_line(
            db, bundle=bu1, item=single, direction="in",
            from_bucket="none", to_bucket="warehouse", quantity=D("5"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.RECEIVE, qty=D("5"),
            before=D("100"), after=D("105"), batch=b1,
            notes=_notes(1, "원자재 입고"),
        )

        # 2. SHIP — 출고 (batch 없이 단순)
        _new_log(
            db, item=single, tx=TransactionTypeEnum.SHIP, qty=D("-3"),
            before=D("200"), after=D("197"),
            notes=_notes(2, "출고"),
        )

        # 3. TRANSFER_TO_PROD — 창고 반출
        b3 = _new_batch(db, emp=emp, sub_type="warehouse_to_dept", to_dept="조립")
        bu3 = _new_bundle(db, batch=b3, item=single, quantity=D("4"))
        _new_line(
            db, bundle=bu3, item=single, direction="move",
            from_bucket="warehouse", to_bucket="production",
            to_dept="조립", quantity=D("4"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.TRANSFER_TO_PROD,
            qty=D("0"), transfer_qty=D("4"), batch=b3,
            notes=_notes(3, "창고 반출"),
        )

        # 4. TRANSFER_TO_WH — 창고 반입
        b4 = _new_batch(db, emp=emp, sub_type="dept_to_warehouse", from_dept="조립")
        bu4 = _new_bundle(db, batch=b4, item=single, quantity=D("2"))
        _new_line(
            db, bundle=bu4, item=single, direction="move",
            from_bucket="production", from_dept="조립",
            to_bucket="warehouse", quantity=D("2"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.TRANSFER_TO_WH,
            qty=D("0"), transfer_qty=D("2"), batch=b4,
            notes=_notes(4, "창고 반입"),
        )

        # 5. TRANSFER_DEPT — 부서 이동
        b5 = _new_batch(db, emp=emp, sub_type="dept_transfer", from_dept="조립", to_dept="고압")
        bu5 = _new_bundle(db, batch=b5, item=single, quantity=D("1"))
        _new_line(
            db, bundle=bu5, item=single, direction="move",
            from_bucket="production", from_dept="조립",
            to_bucket="production", to_dept="고압",
            quantity=D("1"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.TRANSFER_DEPT,
            qty=D("0"), transfer_qty=D("1"), batch=b5,
            notes=_notes(5, "부서 이동"),
        )

        # 6. ADJUST + (수정 이력 케이스 14 가 이 log 를 참조)
        b6 = _new_batch(db, emp=emp, sub_type="adjust_in", to_dept="조립")
        bu6 = _new_bundle(db, batch=b6, item=single, quantity=D("5"))
        _new_line(
            db, bundle=bu6, item=single, direction="adjust",
            from_bucket="none", to_bucket="production", to_dept="조립",
            quantity=D("5"),
        )
        case6_log = _new_log(
            db, item=single, tx=TransactionTypeEnum.ADJUST,
            qty=D("5"), before=D("50"), after=D("55"), batch=b6,
            notes=_notes(6, "수량 조정 +"),
        )

        # 7. ADJUST -
        b7 = _new_batch(db, emp=emp, sub_type="adjust_out", from_dept="조립")
        bu7 = _new_bundle(db, batch=b7, item=single, quantity=D("4"))
        _new_line(
            db, bundle=bu7, item=single, direction="adjust",
            from_bucket="production", from_dept="조립", to_bucket="none",
            quantity=D("4"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.ADJUST,
            qty=D("-4"), before=D("60"), after=D("56"), batch=b7,
            notes=_notes(7, "수량 조정 -"),
        )

        # 8. MARK_DEFECTIVE — 불량 처리
        b8 = _new_batch(db, emp=emp, sub_type="defect_quarantine", from_dept="조립")
        bu8 = _new_bundle(db, batch=b8, item=single, quantity=D("2"))
        _new_line(
            db, bundle=bu8, item=single, direction="defective",
            from_bucket="production", from_dept="조립",
            to_bucket="defective", quantity=D("2"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.MARK_DEFECTIVE,
            qty=D("0"), transfer_qty=D("2"), batch=b8,
            notes=_notes(8, "불량 처리"),
        )

        # 9. SUPPLIER_RETURN — 공급사 반품
        b9 = _new_batch(db, emp=emp, sub_type="supplier_return", from_dept="조립 불량")
        bu9 = _new_bundle(db, batch=b9, item=single, quantity=D("2"))
        _new_line(
            db, bundle=bu9, item=single, direction="out",
            from_bucket="defective", from_dept="조립 불량",
            to_bucket="none", quantity=D("2"),
        )
        _new_log(
            db, item=single, tx=TransactionTypeEnum.SUPPLIER_RETURN,
            qty=D("-2"), before=D("20"), after=D("18"), batch=b9,
            notes=_notes(9, "공급사 반품"),
        )

        # 10. PRODUCE BOM
        b10 = _new_batch(db, emp=emp, sub_type="produce", from_dept="조립", to_dept="조립")
        bu10 = _new_bundle(
            db, batch=b10, item=parent, quantity=D("3"), source_kind="bom_parent",
        )
        _new_line(
            db, bundle=bu10, item=parent, direction="in",
            from_bucket="none", to_bucket="production", to_dept="조립",
            quantity=D("3"),
        )
        for child in children[:3]:
            _new_line(
                db, bundle=bu10, item=child, direction="out",
                from_bucket="production", from_dept="조립",
                to_bucket="none", quantity=D("3"), origin="bom_auto",
            )
        _new_log(
            db, item=parent, tx=TransactionTypeEnum.PRODUCE,
            qty=D("3"), batch=b10,
            notes=_notes(10, "생산 등록 BOM 부모"),
        )
        for child in children[:3]:
            _new_log(
                db, item=child, tx=TransactionTypeEnum.BACKFLUSH,
                qty=D("-3"), transfer_qty=D("3"), batch=b10,
                notes=_notes(10, f"생산 등록 BOM 자식 {child.item_name}"),
            )

        # 11. DISASSEMBLE BOM — 재작업
        b11 = _new_batch(db, emp=emp, sub_type="disassemble", from_dept="조립", to_dept="조립")
        bu11 = _new_bundle(
            db, batch=b11, item=parent, quantity=D("2"), source_kind="bom_parent",
        )
        _new_line(
            db, bundle=bu11, item=parent, direction="out",
            from_bucket="production", from_dept="조립",
            to_bucket="none", quantity=D("2"),
        )
        for child in children[:2]:
            _new_line(
                db, bundle=bu11, item=child, direction="in",
                from_bucket="none", to_bucket="production", to_dept="조립",
                quantity=D("2"), origin="bom_auto",
            )
        _new_log(
            db, item=parent, tx=TransactionTypeEnum.DISASSEMBLE,
            qty=D("-2"), batch=b11,
            notes=_notes(11, "재작업 BOM 부모"),
        )
        for child in children[:2]:
            _new_log(
                db, item=child, tx=TransactionTypeEnum.PRODUCE,
                qty=D("2"), batch=b11,
                notes=_notes(11, f"재작업 BOM 자식 {child.item_name}"),
            )

        # 12. BACKFLUSH 단일 — 자동 차감 (낱개 분기)
        _new_log(
            db, item=single2, tx=TransactionTypeEnum.BACKFLUSH,
            qty=D("-2"), transfer_qty=D("2"),
            notes=_notes(12, "자동 차감 단일"),
        )

        # 13. PRODUCE BOM with 제외 자식
        b13 = _new_batch(db, emp=emp, sub_type="produce", from_dept="조립", to_dept="조립")
        bu13 = _new_bundle(
            db, batch=b13, item=parent, quantity=D("1"), source_kind="bom_parent",
        )
        _new_line(
            db, bundle=bu13, item=parent, direction="in",
            from_bucket="none", to_bucket="production", to_dept="조립",
            quantity=D("1"),
        )
        _new_line(
            db, bundle=bu13, item=children[0], direction="out",
            from_bucket="production", from_dept="조립",
            to_bucket="none", quantity=D("1"), origin="bom_auto",
        )
        _new_line(
            db, bundle=bu13, item=children[1], direction="out",
            from_bucket="production", from_dept="조립",
            to_bucket="none", quantity=D("1"), origin="bom_auto", included=False,
        )
        _new_log(
            db, item=parent, tx=TransactionTypeEnum.PRODUCE,
            qty=D("1"), batch=b13,
            notes=_notes(13, "생산 등록 + 제외 자식"),
        )
        _new_log(
            db, item=children[0], tx=TransactionTypeEnum.BACKFLUSH,
            qty=D("-1"), transfer_qty=D("1"), batch=b13,
            notes=_notes(13, "포함 자식"),
        )

        # 14. ADJUST + 수정 이력 (수정됨 chip + Collapsible 펼침 케이스)
        edit = TransactionEditLog(
            original_log_id=case6_log.log_id,
            edited_by_employee_id=emp.employee_id,
            edited_by_name=emp.name,
            reason="검수용 정정 이력 — phase4 카드 14 수정됨 chip 확인",
            before_payload=json.dumps(
                {"quantity_change": "5", "notes": "before"}, ensure_ascii=False
            ),
            after_payload=json.dumps(
                {"quantity_change": "5", "notes": "after"}, ensure_ascii=False
            ),
        )
        db.add(edit)

        # 15. legacy — batch null + before/after null (unavailable 흐름 케이스)
        _new_log(
            db, item=single, tx=TransactionTypeEnum.PRODUCE,
            qty=D("0"),
            notes=_notes(15, "레거시 데이터 — operation_batch_id null"),
        )

        db.commit()

    print(f"[OK] 15 cases seeded with marker: {MARKER}")
    print(f"  /legacy?tab=history 검색바에 '{MARKER}' 입력해 필터")
    return 0


if __name__ == "__main__":
    sys.exit(main())
