---
type: code-note
project: ERP
layer: backend
source_path: backend/app/services/queue.py
status: active
updated: 2026-04-27
source_sha: c814466a25e5
tags:
  - erp
  - backend
  - service
  - py
---

# queue.py

> [!summary] 역할
> 라우터에서 직접 처리하기 무거운 `queue` 비즈니스 로직과 계산 책임을 분리해 담는다.

## 원본 위치

- Source: `backend/app/services/queue.py`
- Layer: `backend`
- Kind: `service`
- Size: `16903` bytes

## 연결

- Parent hub: [[backend/app/services/services|backend/app/services]]
- Related: [[backend/backend]]

## 읽는 포인트

- 서비스는 라우터보다 안쪽의 업무 규칙을 담는다.
- 재고 수량이나 BOM 계산은 화면 표시와 실제 거래가 일치해야 한다.

## 원본 발췌

> 전체 439줄 중 앞부분만 발췌했다. 실제 수정은 원본 파일을 기준으로 한다.

````python
"""Queue batch service: 예약(Pending)/확정(Commit) 2단계 워크플로.

Batch types
    PRODUCE      — 상위 품목 생산. BOM 자동 확장 → 자식 품목이 OUT 라인(예약),
                   상위 품목은 confirm 시 IN으로 증가.
    DISASSEMBLE  — 상위 품목 분해. 상위가 OUT(차감), 자식이 IN(선별 입고)이
                   되며 included=False인 라인은 폐기/분실로 분기 가능.
    RETURN       — 상위 품목 반품 입고. 상위가 IN이며, BOM 라인을 호출해
                   구성품 중 누락된 것을 LOSS로 전환.

Lifecycle
    1. create_batch(...)  → status=OPEN, BOM 라인 자동 생성, OUT 라인은
       inventory.pending_quantity에 즉시 예약(Available→Pending 이동).
    2. override_line_quantity / toggle_line / add_line / remove_line — OPEN
       상태에서 자유 수정. Pending 증감이 즉시 반영됨.
    3. confirm_batch(...)  → Pending 정리 + Total 실제 차감(OUT), IN 라인
       증가, SCRAP/LOSS 로그 생성, variance_logs 기록. TransactionLog에
       batch_id 심음.
    4. cancel_batch(...)   → Pending 해제 (Available 복구), status=CANCELLED.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from decimal import Decimal
from typing import Iterable, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models import (
    Employee,
    Inventory,
    Item,
    LossLog,
    QueueBatch,
    QueueBatchStatusEnum,
    QueueBatchTypeEnum,
    QueueLine,
    QueueLineDirectionEnum,
    ScrapLog,
    TransactionLog,
    TransactionTypeEnum,
    VarianceLog,
)
from app.services import inventory as inv_svc
from app.services.bom import direct_children, explode_bom, merge_requirements


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def create_batch(
    db: Session,
    *,
    batch_type: QueueBatchTypeEnum,
    parent_item_id: Optional[uuid.UUID] = None,
    parent_quantity: Optional[Decimal] = None,
    owner: Optional[Employee] = None,
    owner_name: Optional[str] = None,
    reference_no: Optional[str] = None,
    notes: Optional[str] = None,
    load_bom: bool = True,
) -> QueueBatch:
    """Create an OPEN batch. If load_bom=True, auto-populate lines from BOM
    and apply Pending reservations for OUT lines."""
    batch = QueueBatch(
        batch_type=batch_type,
        status=QueueBatchStatusEnum.OPEN,
        parent_item_id=parent_item_id,
        parent_quantity=parent_quantity,
        owner_employee_id=owner.employee_id if owner else None,
        owner_name=owner.name if owner else owner_name,
        reference_no=reference_no,
        notes=notes,
    )
    db.add(batch)
    db.flush()

    if load_bom and parent_item_id is not None and parent_quantity is not None:
        _seed_lines_from_bom(db, batch, parent_item_id, parent_quantity)

    return batch


def _seed_lines_from_bom(
    db: Session,
    batch: QueueBatch,
    parent_item_id: uuid.UUID,
    parent_quantity: Decimal,
) -> None:
    """Populate initial QueueLines based on batch_type.

    PRODUCE:     depth-expanded leaves as OUT, with Pending reservation.
    DISASSEMBLE: parent as OUT (Pending), immediate children as IN (no reserve).
    RETURN:      parent as IN (no reserve), immediate children listed as IN
                 (user will mark missing ones as LOSS via toggle_line).
    """
    if batch.batch_type == QueueBatchTypeEnum.PRODUCE:
        pairs = merge_requirements(explode_bom(db, parent_item_id, parent_quantity))
        for item_id, qty in pairs.items():
            _add_and_reserve(db, batch, item_id, qty, QueueLineDirectionEnum.OUT, bom_expected=qty)
        # Parent goes IN upon confirm
        _add_line_no_reserve(
            db, batch, parent_item_id, parent_quantity, QueueLineDirectionEnum.IN
        )

    elif batch.batch_type == QueueBatchTypeEnum.DISASSEMBLE:
        # Parent comes out of inventory
        _add_and_reserve(db, batch, parent_item_id, parent_quantity, QueueLineDirectionEnum.OUT, bom_expected=parent_quantity)
        for child_id, each_qty in direct_children(db, parent_item_id):
            qty = each_qty * parent_quantity
            _add_line_no_reserve(db, batch, child_id, qty, QueueLineDirectionEnum.IN, bom_expected=qty)

    elif batch.batch_type == QueueBatchTypeEnum.RETURN:
        _add_line_no_reserve(db, batch, parent_item_id, parent_quantity, QueueLineDirectionEnum.IN, bom_expected=parent_quantity)
        for child_id, each_qty in direct_children(db, parent_item_id):
            qty = each_qty * parent_quantity
            _add_line_no_reserve(db, batch, child_id, qty, QueueLineDirectionEnum.IN, bom_expected=qty)


def _add_and_reserve(
    db: Session,
    batch: QueueBatch,
    item_id: uuid.UUID,
    qty: Decimal,
    direction: QueueLineDirectionEnum,
    *,
    bom_expected: Optional[Decimal] = None,
) -> QueueLine:
    inv_svc.reserve(
        db, item_id, qty,
        employee_name=batch.owner_name,
    )
    line = QueueLine(
        batch_id=batch.batch_id,
        item_id=item_id,
        direction=direction,
        quantity=qty,
        bom_expected=bom_expected,
        included=True,
    )
    db.add(line)
    db.flush()
    return line


def _add_line_no_reserve(
    db: Session,
    batch: QueueBatch,
    item_id: uuid.UUID,
    qty: Decimal,
    direction: QueueLineDirectionEnum,
    *,
    bom_expected: Optional[Decimal] = None,
) -> QueueLine:
    line = QueueLine(
        batch_id=batch.batch_id,
        item_id=item_id,
        direction=direction,
        quantity=qty,
        bom_expected=bom_expected,
        included=True,
    )
    db.add(line)
    db.flush()
    return line


# ---------------------------------------------------------------------------
# Mutate (OPEN only)
# ---------------------------------------------------------------------------


def _ensure_open(batch: QueueBatch) -> None:
    if batch.status != QueueBatchStatusEnum.OPEN:
        raise ValueError(f"배치가 OPEN 상태가 아닙니다 (현재: {batch.status.value}).")


def override_line_quantity(
    db: Session, line: QueueLine, new_qty: Decimal
) -> QueueLine:
    """Change quantity of an OPEN line. For OUT lines this adjusts Pending
    accordingly (delta can be positive or negative)."""
    if new_qty < 0:
        raise ValueError("수량은 0 이상이어야 합니다.")
    batch = line.batch
    _ensure_open(batch)

    if line.direction == QueueLineDirectionEnum.OUT and line.included:
        delta = new_qty - line.quantity
        if delta > 0:
            inv_svc.reserve(db, line.item_id, delta, employee_name=batch.owner_name)
        elif delta < 0:
            inv_svc.release(db, line.item_id, -delta)
    line.quantity = new_qty
    return line


def toggle_line(
    db: Session, line: QueueLine, *, included: bool, new_direction: Optional[QueueLineDirectionEnum] = None
) -> QueueLine:
    """Enable/disable a line, optionally re-classifying its direction (e.g.
    mark as LOSS/SCRAP instead of IN). Pending is adjusted for OUT lines."""
    _ensure_open(line.batch)
    prev_included = line.included
    prev_direction = line.direction
    batch = line.batch

    # Compute effective pending delta: Pending exists only for OUT+included.
    prev_reserves = prev_included and prev_direction == QueueLineDirectionEnum.OUT
    new_direction_final = new_direction if new_direction is not None else line.direction
    new_reserves = included and new_direction_final == QueueLineDirectionEnum.OUT

    if prev_reserves and not new_reserves:
        inv_svc.release(db, line.item_id, line.quantity)
    elif not prev_reserves and new_reserves:
        inv_svc.reserve(db, line.item_id, line.quantity, employee_name=batch.owner_name)
````

---

## 정책

- `main` 브랜치는 코드만 유지한다.
- `vault-sync` 브랜치는 같은 코드에 `vault/` 인수인계 문서를 더한다.
- 코드와 노트가 다르면 실제 코드가 우선이다.
