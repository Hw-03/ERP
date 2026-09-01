"""대표 품목의 기존 B 합계를 같은 앵글의 한 셀에 여러 박스로 재배치한다.

기존 박스 수량 합을 보존하고 원장 서비스를 통해 이동하므로 W=B+Z+U를 유지한다.

실행:
  cd backend
  python ../_attic/backend-scripts/distribute_warehouse_boxes.py          # dry-run
  python ../_attic/backend-scripts/distribute_warehouse_boxes.py --apply
"""

from __future__ import annotations

from collections import Counter, defaultdict
import sys
from types import SimpleNamespace
from uuid import uuid4

sys.path.insert(0, ".")

from sqlalchemy.orm import Session  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    BoxSizeEnum,
    Item,
    WarehouseAngle,
    WarehouseBox,
    WarehouseBoxItem,
)
from app.services.warehouse_map import (  # noqa: E402
    JARI_CAPACITY,
    SIZE_UNIT,
    reconcile_inventory,
    _replace_box_items,
)


TARGET_CODES = (
    "9-HR-0057",
    "46-AR-0075",
    "7-AF-0028",
    "78-PR-0042",
    "7-AR-0212",
    "8-AA-0070",
)
SPLIT = 4


def _cell_state(
    db: Session,
    angle_id: int,
    *,
    ignored_box_ids: set[object],
) -> tuple[dict[tuple[int, int, int], int], dict[tuple[int, int, int], int]]:
    """Return occupied units and the next safe stack order per position."""
    used: dict[tuple[int, int, int], int] = defaultdict(int)
    next_stack: dict[tuple[int, int, int], int] = defaultdict(int)
    boxes = db.query(WarehouseBox).filter(WarehouseBox.angle_id == angle_id).all()
    for box in boxes:
        if box.box_id in ignored_box_ids:
            continue
        key = (box.row_no, box.layer_no, box.jari_index)
        size = box.size.value if hasattr(box.size, "value") else box.size
        used[key] += SIZE_UNIT.get(size, 1)
        next_stack[key] = max(next_stack[key], int(box.stack_order) + 1)
    return used, next_stack


def _contents_by_box(
    db: Session,
    boxes: list[WarehouseBox],
) -> dict[object, list[WarehouseBoxItem]]:
    box_ids = [box.box_id for box in boxes]
    rows = (
        db.query(WarehouseBoxItem)
        .filter(WarehouseBoxItem.box_id.in_(box_ids))
        .order_by(
            WarehouseBoxItem.box_id,
            WarehouseBoxItem.item_id,
            WarehouseBoxItem.id,
        )
        .all()
    )
    result: dict[object, list[WarehouseBoxItem]] = defaultdict(list)
    for row in rows:
        result[row.box_id].append(row)
    return result


def _distribute_item(
    db: Session,
    *,
    item: Item,
    angles: dict[int, WarehouseAngle],
) -> bool:
    boxes = (
        db.query(WarehouseBox)
        .join(WarehouseBoxItem, WarehouseBoxItem.box_id == WarehouseBox.box_id)
        .filter(WarehouseBoxItem.item_id == item.item_id)
        .order_by(WarehouseBox.box_id)
        .all()
    )
    if not boxes:
        print(f"  [skip] {item.mes_code} 박스 없음")
        return False

    contents_by_box = _contents_by_box(db, boxes)
    target_rows = [
        row
        for rows in contents_by_box.values()
        for row in rows
        if row.item_id == item.item_id
    ]
    placed_total = sum(int(row.quantity) for row in target_rows)
    split_count = min(SPLIT, placed_total)
    if split_count == 0:
        print(f"  [skip] {item.mes_code} 박스 수량 0")
        return False

    angle_id = Counter(box.angle_id for box in boxes).most_common(1)[0][0]
    angle = angles[angle_id]
    emptied_box_ids = {
        box.box_id
        for box in boxes
        if all(row.item_id == item.item_id for row in contents_by_box[box.box_id])
    }
    used, next_stack = _cell_state(
        db,
        angle_id,
        ignored_box_ids=emptied_box_ids,
    )
    cells = sorted(
        (
            (
                sum(
                    JARI_CAPACITY - used.get((row, layer, jari), 0)
                    for jari in range(angle.jaris_per_cell)
                ),
                row,
                layer,
            )
            for row in range(1, angle.rows + 1)
            for layer in range(1, angle.layers + 1)
        ),
        reverse=True,
    )
    free_units, row_no, layer_no = cells[0]
    if free_units < split_count:
        print(
            f"  [skip] 앵글{angle_id} 한 셀 빈 공간 부족"
            f"(최대 {free_units}<{split_count}) — {item.mes_code}"
        )
        return False

    for box in boxes:
        remaining = [
            SimpleNamespace(item_id=row.item_id, quantity=int(row.quantity))
            for row in contents_by_box[box.box_id]
            if row.item_id != item.item_id
        ]
        _replace_box_items(db, box.box_id, remaining)
        if not remaining:
            db.delete(box)
    db.flush()

    base, remainder = divmod(placed_total, split_count)
    parts = [base + (1 if index < remainder else 0) for index in range(split_count)]
    placed: list[tuple[int, int, int]] = []
    part_index = 0
    jari_order = sorted(
        range(angle.jaris_per_cell),
        key=lambda jari: used.get((row_no, layer_no, jari), 0),
    )
    for jari in jari_order:
        key = (row_no, layer_no, jari)
        while used.get(key, 0) < JARI_CAPACITY and part_index < split_count:
            stack_order = next_stack.get(key, 0)
            box = WarehouseBox(
                box_id=str(uuid4()),
                angle_id=angle_id,
                row_no=row_no,
                layer_no=layer_no,
                jari_index=jari,
                size=BoxSizeEnum.SMALL,
                stack_order=stack_order,
            )
            db.add(box)
            db.flush()
            _replace_box_items(
                db,
                box.box_id,
                [
                    SimpleNamespace(
                        item_id=item.item_id,
                        quantity=parts[part_index],
                    )
                ],
            )
            used[key] = used.get(key, 0) + 1
            next_stack[key] = stack_order + 1
            placed.append((jari, stack_order, parts[part_index]))
            part_index += 1
        if part_index >= split_count:
            break

    location = "  ".join(
        f"자리{jari}.스택{stack}={quantity}"
        for jari, stack, quantity in placed
    )
    print(
        f"{item.mes_code} (B 총 {placed_total}) -> "
        f"앵글{angle_id}.{row_no}줄.{layer_no}층"
    )
    print(f"    {location}")
    return True


def main() -> None:
    apply_mode = "--apply" in sys.argv
    print(
        f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} "
        "대표 품목 같은-앵글 한 셀 분산\n"
    )
    db = SessionLocal()
    try:
        angles = {angle.id: angle for angle in db.query(WarehouseAngle).all()}
        changed = 0
        for code in TARGET_CODES:
            item = (
                db.query(Item)
                .filter(Item.mes_code == code, Item.deleted_at.is_(None))
                .first()
            )
            if item is None:
                print(f"  [skip] {code} 없음")
                continue
            changed += int(_distribute_item(db, item=item, angles=angles))

        report = reconcile_inventory(db)
        if report["ledger_mismatch_count"]:
            raise RuntimeError(
                "W=B+Z+U 원장 대조 실패: "
                f"{report['ledger_mismatch_count']}개 품목"
            )

        if apply_mode:
            db.commit()
            print(f"\n완료: {changed}개 품목 재배치, W=B+Z+U 대조 통과")
        else:
            db.rollback()
            print(f"\n[DRY-RUN] 예상 재배치: {changed}개 품목")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
