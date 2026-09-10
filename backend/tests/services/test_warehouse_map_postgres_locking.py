"""R1 차감 쿼리의 DB별 잠금 범위를 검증한다."""

from __future__ import annotations

from collections.abc import Iterator
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from threading import Barrier, Event, get_ident
from types import SimpleNamespace

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi import HTTPException
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool
from starlette.requests import Request

from app.models import (
    DepartmentEnum,
    DefectQuarantineRecord,
    Employee,
    EmployeeLevelEnum,
    InventoryOperation,
    RequestBucketEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    SystemSetting,
    TransactionLog,
    TransactionTypeEnum,
    WarehouseBoxItem,
)
from app.routers import items as items_router
from app.routers.warehouse_map import angles as angles_router
from app.routers.warehouse_map import boxes as boxes_router
from app.schemas import WarehouseBoxMove
from app.services import defect_actions
from app.services import defect_records as defect_records_service
from app.services import inventory as inventory_service
from app.services import inventory_operation_cancellation as cancellation_service
from app.services import inventory_operations as inventory_operation_service
from app.services import sr_approval
from app.services import transaction_actions
from app.services import warehouse_map as warehouse_map_service
from app.services.inventory import _consume_warehouse
from app.services.pin_auth import DEFAULT_PIN_HASH


TEST_POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")


@pytest.fixture
def postgres_inventory_operation_cutover() -> Iterator[None]:
    """Run operation-cancellation races with the ledger explicitly active."""
    if not TEST_POSTGRES_URL:
        yield
        return

    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    database_name = make_url(TEST_POSTGRES_URL).database
    assert database_name and (
        database_name.startswith("test_") or database_name.endswith("_test")
    )
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    setting_key = inventory_operation_service.CUTOVER_SETTING_KEY
    original_value: str | None = None
    try:
        with Session(engine) as setup:
            setting = setup.get(SystemSetting, setting_key)
            if setting is None:
                setup.add(
                    SystemSetting(
                        setting_key=setting_key,
                        setting_value="2026-01-01T00:00:00",
                    )
                )
            else:
                original_value = setting.setting_value
                setting.setting_value = "2026-01-01T00:00:00"
            setup.commit()
        yield
    finally:
        with Session(engine) as cleanup:
            setting = cleanup.get(SystemSetting, setting_key)
            if original_value is None:
                if setting is not None:
                    cleanup.delete(setting)
            elif setting is None:
                cleanup.add(
                    SystemSetting(
                        setting_key=setting_key,
                        setting_value=original_value,
                    )
                )
            else:
                setting.setting_value = original_value
            cleanup.commit()
        engine.dispose()


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "PATCH",
            "path": path,
            "headers": [],
            "query_string": b"",
            "scheme": "http",
            "server": ("testserver", 80),
            "client": ("127.0.0.1", 1),
        }
    )


def _insert_public_ledger_item(
    connection: Connection,
    *,
    item_id: uuid.UUID,
    inventory_id: uuid.UUID,
    unplaced_id: uuid.UUID,
    warehouse_quantity: int,
    unplaced_quantity: int,
) -> None:
    connection.execute(
        text(
            """INSERT INTO items
            (item_id, item_name, unit, model_symbol, process_type_code, serial_no)
            VALUES (:item_id, :name, 'EA', :symbol, 'TR', 1)"""
        ),
        {
            "item_id": item_id.hex,
            "name": f"PG warehouse lock {item_id.hex}",
            "symbol": f"PG{item_id.hex[:10]}",
        },
    )
    connection.execute(
        text(
            """INSERT INTO inventory
            (inventory_id, item_id, quantity, warehouse_qty, pending_quantity)
            VALUES (:inventory_id, :item_id, :quantity, :quantity, 0)"""
        ),
        {
            "inventory_id": inventory_id.hex,
            "item_id": item_id.hex,
            "quantity": warehouse_quantity,
        },
    )
    connection.execute(
        text(
            """INSERT INTO warehouse_unplaced_items (id, item_id, quantity)
            VALUES (:id, :item_id, :quantity)"""
        ),
        {
            "id": unplaced_id.hex,
            "item_id": item_id.hex,
            "quantity": unplaced_quantity,
        },
    )


def _insert_public_angle(connection: Connection, *, label: str) -> int:
    return int(
        connection.execute(
            text(
                """INSERT INTO warehouse_angles (
                    id, label, angle_type, rows, layers, jaris_per_cell,
                    pos_x, pos_y, width, height, display_order, is_active
                ) VALUES (
                    (SELECT COALESCE(MAX(id), 0) + 1 FROM warehouse_angles),
                    :label, 'angle', 1, 1, 3,
                    0, 0, 72, 60,
                    (SELECT COALESCE(MAX(display_order), 0) + 1 FROM warehouse_angles),
                    true
                ) RETURNING id"""
            ),
            {"label": label},
        ).scalar_one()
    )


def _cleanup_public_ledger_fixture(
    engine,
    *,
    item_id: uuid.UUID,
    actor_id: uuid.UUID | None = None,
    box_id: uuid.UUID | None = None,
    angle_id: int | None = None,
) -> None:
    """Remove one test's committed public-schema rows in FK-safe order."""
    with engine.begin() as cleanup:
        cleanup.execute(
            text("DELETE FROM stock_request_lines WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        if actor_id is not None:
            cleanup.execute(
                text(
                    "DELETE FROM stock_requests "
                    "WHERE requester_employee_id = :actor_id"
                ),
                {"actor_id": actor_id.hex},
            )
            cleanup.execute(
                text(
                    "DELETE FROM inventory_operation_effects WHERE operation_id IN "
                    "(SELECT operation_id FROM inventory_operations "
                    "WHERE actor_employee_id = :actor_id)"
                ),
                {"actor_id": actor_id.hex},
            )
        cleanup.execute(
            text("DELETE FROM defect_inventory_movements WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        cleanup.execute(
            text("DELETE FROM transaction_logs WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        if actor_id is not None:
            cleanup.execute(
                text("DELETE FROM inventory_operations WHERE actor_employee_id = :actor_id"),
                {"actor_id": actor_id.hex},
            )
        cleanup.execute(
            text("DELETE FROM defect_quarantine_records WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        cleanup.execute(
            text("DELETE FROM inventory_locations WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        if box_id is not None:
            cleanup.execute(
                text("DELETE FROM warehouse_boxes WHERE box_id = :box_id"),
                {"box_id": box_id.hex},
            )
        cleanup.execute(
            text("DELETE FROM warehouse_unplaced_items WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        cleanup.execute(
            text("DELETE FROM inventory WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        cleanup.execute(
            text("DELETE FROM items WHERE item_id = :item_id"),
            {"item_id": item_id.hex},
        )
        if actor_id is not None:
            cleanup.execute(
                text("DELETE FROM employees WHERE employee_id = :actor_id"),
                {"actor_id": actor_id.hex},
            )
        if angle_id is not None:
            cleanup.execute(
                text("DELETE FROM warehouse_angles WHERE id = :angle_id"),
                {"angle_id": angle_id},
            )


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL Alembic-head 검증을 건너뜁니다.",
)
def test_postgres_head_public_tables_serialize_two_connections():
    """Alembic head의 실제 public inventory 행을 두 연결이 직렬화한다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    expected_database = make_url(TEST_POSTGRES_URL).database
    assert expected_database and (
        expected_database.startswith("test_") or expected_database.endswith("_test")
    )
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    config = Config(str(Path(__file__).resolve().parents[2] / "alembic.ini"))
    head = ScriptDirectory.from_config(config).get_current_head()
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    session_a = None
    session_b = None
    try:
        with engine.begin() as connection:
            assert connection.execute(text("SELECT current_database()")).scalar_one() == expected_database
            assert connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one() == head
            connection.execute(
                text(
                    """INSERT INTO items
                    (item_id, item_name, unit, model_symbol, process_type_code, serial_no)
                    VALUES (:item_id, :name, 'EA', :symbol, 'TR', :serial)"""
                ),
                {"item_id": item_id.hex, "name": f"PG lock {item_id.hex}", "symbol": f"PG{item_id.hex[:8]}", "serial": 1},
            )
            connection.execute(
                text(
                    """INSERT INTO inventory
                    (inventory_id, item_id, quantity, warehouse_qty, pending_quantity)
                    VALUES (:inventory_id, :item_id, 2, 2, 0)"""
                ),
                {"inventory_id": inventory_id.hex, "item_id": item_id.hex},
            )
            connection.execute(
                text(
                    """INSERT INTO warehouse_unplaced_items
                    (id, item_id, quantity)
                    VALUES (:id, :item_id, 2)"""
                ),
                {"id": unplaced_id.hex, "item_id": item_id.hex},
            )

        session_a = Session(engine)
        session_b = Session(engine)
        assert session_a.execute(text("SELECT pg_backend_pid()")).scalar_one() != session_b.execute(
            text("SELECT pg_backend_pid()")
        ).scalar_one()
        warehouse_map_service.lock_warehouse_map_rows(session_a, item_ids=[item_id])
        session_b.execute(text("SET LOCAL lock_timeout = '100ms'"))
        with pytest.raises(OperationalError):
            warehouse_map_service.lock_warehouse_map_rows(session_b, item_ids=[item_id])
        session_b.rollback()
        session_a.commit()
        warehouse_map_service.lock_warehouse_map_rows(session_b, item_ids=[item_id])
        session_b.rollback()
    finally:
        if session_b is not None:
            session_b.close()
        if session_a is not None:
            session_a.close()
        with engine.begin() as cleanup:
            cleanup.execute(
                text("DELETE FROM warehouse_unplaced_items WHERE id = :id"),
                {"id": unplaced_id.hex},
            )
            cleanup.execute(text("DELETE FROM inventory WHERE inventory_id = :id"), {"id": inventory_id.hex})
            cleanup.execute(text("DELETE FROM items WHERE item_id = :id"), {"id": item_id.hex})
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL Inventory 잠금 검증을 건너뜁니다.",
)
def test_postgres_inventory_bulk_lock_blocks_a_second_connection_update() -> None:
    """실제 세션 dialect로 Inventory 행을 잠가 두 번째 연결의 쓰기를 차단한다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    session_a: Session | None = None
    session_b: Session | None = None
    try:
        with engine.begin() as setup:
            _insert_public_ledger_item(
                setup,
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )

        session_a = Session(engine)
        session_b = Session(engine)
        inventory_service._ensure_and_lock_inventories(session_a, [item_id])
        session_b.execute(text("SET LOCAL lock_timeout = '100ms'"))

        with pytest.raises(OperationalError):
            session_b.execute(
                text(
                    "UPDATE inventory SET pending_quantity = pending_quantity + 1 "
                    "WHERE item_id = :item_id"
                ),
                {"item_id": item_id.hex},
            )

        session_b.rollback()
        session_a.commit()
        session_b.execute(
            text(
                "UPDATE inventory SET pending_quantity = pending_quantity + 1 "
                "WHERE item_id = :item_id"
            ),
            {"item_id": item_id.hex},
        )
        session_b.rollback()
    finally:
        if session_b is not None:
            session_b.close()
        if session_a is not None:
            session_a.close()
        _cleanup_public_ledger_fixture(engine, item_id=item_id)
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL 배치/격리 경합을 건너뜁니다.",
)
def test_postgres_box_placement_and_quarantine_share_item_first_lock_order() -> None:
    """박스 배치와 창고 불량 격리는 교착 없이 모두 반영되고 W=B+Z+U를 지킨다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    expected_database = make_url(TEST_POSTGRES_URL).database
    assert expected_database and (
        expected_database.startswith("test_") or expected_database.endswith("_test")
    )
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    box_id = uuid.uuid4()
    angle_id: int | None = None
    start = Barrier(2)
    try:
        with Session(engine) as setup:
            assert setup.execute(text("SELECT current_database()")).scalar_one() == expected_database
            setup.add(
                Employee(
                    employee_id=actor_id,
                    employee_code=f"PG-W2-{actor_id.hex[:12]}",
                    name="PG W2 actor",
                    role="tester",
                    department=DepartmentEnum.ASSEMBLY.value,
                    level=EmployeeLevelEnum.STAFF,
                    is_active=True,
                )
            )
            setup.flush()
            connection = setup.connection()
            _insert_public_ledger_item(
                connection,
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=2,
                unplaced_quantity=2,
            )
            angle_id = _insert_public_angle(
                connection,
                label=f"w2-place-quarantine-{uuid.uuid4().hex[:8]}",
            )
            setup.execute(
                text(
                    """INSERT INTO warehouse_boxes (
                        box_id, angle_id, row_no, layer_no, jari_index,
                        size, stack_order
                    ) VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)"""
                ),
                {"box_id": box_id.hex, "angle_id": angle_id},
            )
            setup.commit()

        def place() -> str:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                start.wait(timeout=5)
                warehouse_map_service._replace_box_items(
                    db,
                    box_id,
                    [SimpleNamespace(item_id=item_id, quantity=1)],
                )
                db.commit()
                return "placed"

        def quarantine() -> str:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                actor = db.get(Employee, actor_id)
                assert actor is not None
                start.wait(timeout=5)
                defect_actions.quarantine_inventory(
                    db,
                    item_id=item_id,
                    qty=Decimal("1"),
                    source="warehouse",
                    target_dept=DepartmentEnum.ASSEMBLY,
                    source_dept=None,
                    actor=actor,
                    reason_category="test",
                    reason_memo="placement race",
                    client_request_id=uuid.uuid4().hex,
                )
                return "quarantined"

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(place), executor.submit(quarantine)]
            outcomes = {future.result(timeout=10) for future in futures}
        assert outcomes == {"placed", "quarantined"}

        with engine.connect() as verify:
            warehouse_qty = int(
                verify.execute(
                    text("SELECT warehouse_qty FROM inventory WHERE item_id = :item_id"),
                    {"item_id": item_id.hex},
                ).scalar_one()
            )
            box_qty = int(
                verify.execute(
                    text(
                        "SELECT COALESCE(SUM(quantity), 0) FROM warehouse_box_items "
                        "WHERE item_id = :item_id"
                    ),
                    {"item_id": item_id.hex},
                ).scalar_one()
            )
            unplaced_qty = int(
                verify.execute(
                    text(
                        "SELECT quantity FROM warehouse_unplaced_items "
                        "WHERE item_id = :item_id"
                    ),
                    {"item_id": item_id.hex},
                ).scalar_one()
            )
            defective_qty = int(
                verify.execute(
                    text(
                        "SELECT quantity FROM inventory_locations "
                        "WHERE item_id = :item_id AND department = :department "
                        "AND status = 'DEFECTIVE'"
                    ),
                    {
                        "item_id": item_id.hex,
                        "department": DepartmentEnum.ASSEMBLY.value,
                    },
                ).scalar_one()
            )
        assert warehouse_qty == 1
        assert warehouse_qty == box_qty + unplaced_qty
        assert defective_qty == 1
    finally:
        _cleanup_public_ledger_fixture(
            engine,
            item_id=item_id,
            actor_id=actor_id,
            box_id=box_id,
            angle_id=angle_id,
        )
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL 삭제/배치 경합을 건너뜁니다.",
)
def test_postgres_soft_delete_and_box_placement_have_exactly_one_winner() -> None:
    """품목 삭제와 첫 박스 배치는 Item 잠금 아래 직렬화되어 한 작업만 성공한다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    box_id = uuid.uuid4()
    angle_id: int | None = None
    start = Barrier(2)
    try:
        with engine.begin() as setup:
            _insert_public_ledger_item(
                setup,
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )
            angle_id = _insert_public_angle(
                setup,
                label=f"w2-delete-place-{uuid.uuid4().hex[:8]}",
            )
            setup.execute(
                text(
                    """INSERT INTO warehouse_boxes (
                        box_id, angle_id, row_no, layer_no, jari_index,
                        size, stack_order
                    ) VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)"""
                ),
                {"box_id": box_id.hex, "angle_id": angle_id},
            )

        def place() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                start.wait(timeout=5)
                try:
                    warehouse_map_service._replace_box_items(
                        db,
                        box_id,
                        [SimpleNamespace(item_id=item_id, quantity=1)],
                    )
                    db.commit()
                    return "place", True
                except ValueError:
                    db.rollback()
                    return "place", False

        def delete() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                start.wait(timeout=5)
                try:
                    items_router.soft_delete_item(
                        item_id,
                        _request(f"/api/items/{item_id}/soft-delete"),
                        None,
                        db,
                    )
                    return "delete", True
                except HTTPException as exc:
                    assert exc.status_code == 409
                    return "delete", False

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(place), executor.submit(delete)]
            outcomes = [future.result(timeout=10) for future in futures]
        assert sum(succeeded for _name, succeeded in outcomes) == 1

        with engine.connect() as verify:
            deleted_at = verify.execute(
                text("SELECT deleted_at FROM items WHERE item_id = :item_id"),
                {"item_id": item_id.hex},
            ).scalar_one()
            box_qty = int(
                verify.execute(
                    text(
                        "SELECT COALESCE(SUM(quantity), 0) FROM warehouse_box_items "
                        "WHERE item_id = :item_id"
                    ),
                    {"item_id": item_id.hex},
                ).scalar_one()
            )
            unplaced_qty = int(
                verify.execute(
                    text(
                        "SELECT quantity FROM warehouse_unplaced_items "
                        "WHERE item_id = :item_id"
                    ),
                    {"item_id": item_id.hex},
                ).scalar_one()
            )
        assert box_qty + unplaced_qty == 1
        assert (deleted_at is not None, box_qty) in {(True, 0), (False, 1)}
    finally:
        _cleanup_public_ledger_fixture(
            engine,
            item_id=item_id,
            box_id=box_id,
            angle_id=angle_id,
        )
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL 격리 취소/복귀 경합을 건너뜁니다.",
)
@pytest.mark.usefixtures("postgres_inventory_operation_cutover")
def test_postgres_quarantine_cancel_and_restore_have_exactly_one_winner() -> None:
    """격리 취소와 정상 복귀는 Item→record 순서로 직렬화되어 한 작업만 성공한다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    start = Barrier(2)
    try:
        with Session(engine) as setup:
            setup.add(
                Employee(
                    employee_id=actor_id,
                    employee_code=f"PG-W2C-{actor_id.hex[:11]}",
                    name="PG W2 cancel actor",
                    role="tester",
                    department=DepartmentEnum.ASSEMBLY.value,
                    level=EmployeeLevelEnum.STAFF,
                    is_active=True,
                )
            )
            setup.flush()
            _insert_public_ledger_item(
                setup.connection(),
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )
            setup.commit()

        with Session(engine) as quarantine_db:
            actor = quarantine_db.get(Employee, actor_id)
            assert actor is not None
            defect_actions.quarantine_inventory(
                quarantine_db,
                item_id=item_id,
                qty=Decimal("1"),
                source="warehouse",
                target_dept=DepartmentEnum.ASSEMBLY,
                source_dept=None,
                actor=actor,
                reason_category="test",
                reason_memo="cancel restore race",
                client_request_id=uuid.uuid4().hex,
            )

        with Session(engine) as plan_db:
            operation_id = plan_db.query(InventoryOperation.operation_id).filter(
                InventoryOperation.actor_employee_id == actor_id,
                InventoryOperation.domain == "defect",
                InventoryOperation.action == "quarantine",
            ).one()[0]
            record_id = plan_db.query(DefectQuarantineRecord.record_id).filter(
                DefectQuarantineRecord.item_id == item_id,
            ).one()[0]
            now = datetime.utcnow()
            preview = cancellation_service.preview_cancellation(
                plan_db,
                operation_id,
                now=now,
            )
            assert preview.can_cancel is True

        def cancel() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                actor = db.get(Employee, actor_id)
                assert actor is not None
                start.wait(timeout=5)
                try:
                    cancellation_service.cancel_operation(
                        db,
                        operation_id=operation_id,
                        canceller=actor,
                        reason="PostgreSQL quarantine cancel race",
                        plan_hash=preview.plan_hash,
                        now=now,
                    )
                    return "cancel", True
                except cancellation_service.CancellationError:
                    db.rollback()
                    return "cancel", False

        def restore() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                actor = db.get(Employee, actor_id)
                assert actor is not None
                start.wait(timeout=5)
                try:
                    defect_actions.unquarantine_inventory(
                        db,
                        record_id=record_id,
                        item_id=item_id,
                        qty=Decimal("1"),
                        dept=DepartmentEnum.ASSEMBLY,
                        actor=actor,
                        reason_category="test",
                        reason_memo="cancel restore race",
                    )
                    return "restore", True
                except ValueError:
                    db.rollback()
                    return "restore", False

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(cancel), executor.submit(restore)]
            outcomes = [future.result(timeout=10) for future in futures]
        assert sum(succeeded for _name, succeeded in outcomes) == 1

        with engine.connect() as verify:
            quantities = verify.execute(
                text(
                    """SELECT inventory.warehouse_qty,
                    warehouse_unplaced_items.quantity AS unplaced_qty,
                    defect_quarantine_records.remaining_quantity
                    FROM inventory
                    JOIN warehouse_unplaced_items
                      ON warehouse_unplaced_items.item_id = inventory.item_id
                    JOIN defect_quarantine_records
                      ON defect_quarantine_records.item_id = inventory.item_id
                    WHERE inventory.item_id = :item_id"""
                ),
                {"item_id": item_id.hex},
            ).one()
            locations = {
                row.status: int(row.quantity)
                for row in verify.execute(
                    text(
                        "SELECT status, quantity FROM inventory_locations "
                        "WHERE item_id = :item_id"
                    ),
                    {"item_id": item_id.hex},
                )
            }
        assert int(quantities.warehouse_qty) == int(quantities.unplaced_qty)
        assert int(quantities.remaining_quantity) == 0
        assert locations.get("DEFECTIVE", 0) == 0
        assert (int(quantities.warehouse_qty), locations.get("PRODUCTION", 0)) in {
            (1, 0),
            (0, 1),
        }
    finally:
        _cleanup_public_ledger_fixture(
            engine,
            item_id=item_id,
            actor_id=actor_id,
        )
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL 격리 취소/승인 경합을 건너뜁니다.",
)
@pytest.mark.usefixtures("postgres_inventory_operation_cutover")
def test_postgres_quarantine_cancel_and_stock_request_approval_are_deadlock_free(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Item→physical→record 순서를 강제 교차해도 DB deadlock 없이 한 작업만 성공한다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    request_id: uuid.UUID | None = None
    thread_roles: dict[int, str] = {}
    cancel_at_physical_lock = Event()
    approval_at_record_lock = Event()
    approval_physical_lock_returned = Event()
    real_map_lock = warehouse_map_service.lock_warehouse_map_rows
    real_record_lock = defect_records_service._get_record_for_action

    def coordinated_map_lock(*args, **kwargs):
        if thread_roles.get(get_ident()) == "cancel" and not cancel_at_physical_lock.is_set():
            cancel_at_physical_lock.set()
            if not approval_at_record_lock.wait(timeout=5):
                raise TimeoutError("stock request approval did not reach the defect record")
        result = real_map_lock(*args, **kwargs)
        if thread_roles.get(get_ident()) == "approval":
            approval_physical_lock_returned.set()
        return result

    def coordinated_record_lock(*args, **kwargs):
        if thread_roles.get(get_ident()) == "approval" and not approval_at_record_lock.is_set():
            assert approval_physical_lock_returned.is_set()
            approval_at_record_lock.set()
            if not cancel_at_physical_lock.wait(timeout=5):
                raise TimeoutError("cancellation did not reach the physical ledger")
        return real_record_lock(*args, **kwargs)

    try:
        with Session(engine) as setup:
            setup.add(
                Employee(
                    employee_id=actor_id,
                    employee_code=f"PG-W2A-{actor_id.hex[:11]}",
                    name="PG W2 approval actor",
                    role="tester",
                    department=DepartmentEnum.ASSEMBLY.value,
                    level=EmployeeLevelEnum.STAFF,
                    warehouse_role="primary",
                    is_active=True,
                    pin_hash=DEFAULT_PIN_HASH,
                )
            )
            setup.flush()
            _insert_public_ledger_item(
                setup.connection(),
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )
            setup.commit()

        with Session(engine) as quarantine_db:
            actor = quarantine_db.get(Employee, actor_id)
            assert actor is not None
            defect_actions.quarantine_inventory(
                quarantine_db,
                item_id=item_id,
                qty=Decimal("1"),
                source="warehouse",
                target_dept=DepartmentEnum.ASSEMBLY,
                source_dept=None,
                actor=actor,
                reason_category="test",
                reason_memo="cancel approval race",
                client_request_id=uuid.uuid4().hex,
            )

        with Session(engine) as setup:
            operation_id = setup.query(InventoryOperation.operation_id).filter(
                InventoryOperation.actor_employee_id == actor_id,
                InventoryOperation.domain == "defect",
                InventoryOperation.action == "quarantine",
            ).one()[0]
            record_id = setup.query(DefectQuarantineRecord.record_id).filter(
                DefectQuarantineRecord.item_id == item_id,
            ).one()[0]
            request = StockRequest(
                request_code=f"SR-PG-{uuid.uuid4().hex[:12].upper()}",
                requester_employee_id=actor_id,
                requester_name="PG W2 approval actor",
                requester_department=DepartmentEnum.ASSEMBLY.value,
                request_type=StockRequestTypeEnum.DEFECT_SCRAP,
                status=StockRequestStatusEnum.SUBMITTED,
                requires_warehouse_approval=True,
                requires_department_approval=False,
                submitted_at=datetime.utcnow(),
                reason_category="test",
                reason_memo="cancel approval race",
            )
            setup.add(request)
            setup.flush()
            request_id = request.request_id
            setup.add(
                StockRequestLine(
                    request_id=request.request_id,
                    item_id=item_id,
                    item_name_snapshot=f"PG warehouse lock {item_id.hex}",
                    quantity=Decimal("1"),
                    from_bucket=RequestBucketEnum.DEFECTIVE,
                    from_department=DepartmentEnum.ASSEMBLY.value,
                    to_bucket=RequestBucketEnum.NONE,
                    to_department=None,
                    status=StockRequestStatusEnum.SUBMITTED,
                    defect_quarantine_record_id=record_id,
                )
            )
            setup.commit()
            now = datetime.utcnow()
            preview = cancellation_service.preview_cancellation(
                setup,
                operation_id,
                now=now,
            )
            assert preview.can_cancel is True

        monkeypatch.setattr(
            warehouse_map_service,
            "lock_warehouse_map_rows",
            coordinated_map_lock,
        )
        monkeypatch.setattr(
            defect_records_service,
            "_get_record_for_action",
            coordinated_record_lock,
        )

        def cancel() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                actor = db.get(Employee, actor_id)
                assert actor is not None
                thread_roles[get_ident()] = "cancel"
                try:
                    cancellation_service.cancel_operation(
                        db,
                        operation_id=operation_id,
                        canceller=actor,
                        reason="PostgreSQL cancel approval race",
                        plan_hash=preview.plan_hash,
                        now=now,
                    )
                    return "cancel", True
                except cancellation_service.CancellationError:
                    db.rollback()
                    return "cancel", False
                finally:
                    thread_roles.pop(get_ident(), None)

        def approve() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                actor = db.get(Employee, actor_id)
                request = db.get(StockRequest, request_id)
                assert actor is not None and request is not None
                thread_roles[get_ident()] = "approval"
                try:
                    sr_approval.approve_request(
                        db,
                        request,
                        approver=actor,
                        pin="0000",
                    )
                    db.commit()
                    return "approval", True
                except (sr_approval.FailedApprovalError, ValueError):
                    db.rollback()
                    return "approval", False
                finally:
                    thread_roles.pop(get_ident(), None)

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(cancel), executor.submit(approve)]
            outcomes = [future.result(timeout=10) for future in futures]
        assert sum(succeeded for _name, succeeded in outcomes) == 1

        with engine.connect() as verify:
            quantities = verify.execute(
                text(
                    """SELECT inventory.warehouse_qty,
                    warehouse_unplaced_items.quantity AS unplaced_qty,
                    defect_quarantine_records.remaining_quantity
                    FROM inventory
                    JOIN warehouse_unplaced_items
                      ON warehouse_unplaced_items.item_id = inventory.item_id
                    JOIN defect_quarantine_records
                      ON defect_quarantine_records.item_id = inventory.item_id
                    WHERE inventory.item_id = :item_id"""
                ),
                {"item_id": item_id.hex},
            ).one()
            defective_qty = int(
                verify.execute(
                    text(
                        "SELECT COALESCE(SUM(quantity), 0) FROM inventory_locations "
                        "WHERE item_id = :item_id AND status = 'DEFECTIVE'"
                    ),
                    {"item_id": item_id.hex},
                ).scalar_one()
            )
        assert int(quantities.warehouse_qty) == int(quantities.unplaced_qty)
        assert int(quantities.warehouse_qty) in {0, 1}
        assert int(quantities.remaining_quantity) == 0
        assert defective_qty == 0
    finally:
        _cleanup_public_ledger_fixture(
            engine,
            item_id=item_id,
            actor_id=actor_id,
        )
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL 레거시 취소/배치 경합을 건너뜁니다.",
)
def test_postgres_legacy_cancel_and_box_placement_share_item_first_lock_order(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """v1 취소와 배치를 강제 교차해도 Inventory→Item 교착이 발생하지 않는다."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    box_id = uuid.uuid4()
    angle_id: int | None = None
    log_id: uuid.UUID | None = None
    thread_roles: dict[int, str] = {}
    cancel_at_physical_lock = Event()
    placement_has_item_lock = Event()
    real_map_lock = warehouse_map_service.lock_warehouse_map_rows

    def coordinated_map_lock(*args, **kwargs):
        if thread_roles.get(get_ident()) == "cancel" and not cancel_at_physical_lock.is_set():
            cancel_at_physical_lock.set()
            if not placement_has_item_lock.wait(timeout=5):
                raise TimeoutError("placement did not acquire the Item row")
        return real_map_lock(*args, **kwargs)

    try:
        with Session(engine) as setup:
            setup.add(
                Employee(
                    employee_id=actor_id,
                    employee_code=f"PG-W2L-{actor_id.hex[:11]}",
                    name="PG W2 legacy actor",
                    role="tester",
                    department=DepartmentEnum.ASSEMBLY.value,
                    level=EmployeeLevelEnum.STAFF,
                    is_active=True,
                )
            )
            setup.flush()
            _insert_public_ledger_item(
                setup.connection(),
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )
            angle_id = _insert_public_angle(
                setup.connection(),
                label=f"w2-legacy-cancel-place-{uuid.uuid4().hex[:8]}",
            )
            setup.execute(
                text(
                    """INSERT INTO warehouse_boxes (
                        box_id, angle_id, row_no, layer_no, jari_index,
                        size, stack_order
                    ) VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)"""
                ),
                {"box_id": box_id.hex, "angle_id": angle_id},
            )
            log = TransactionLog(
                item_id=item_id,
                transaction_type=TransactionTypeEnum.RECEIVE,
                quantity_change=Decimal("1"),
                quantity_before=Decimal("0"),
                quantity_after=Decimal("1"),
                warehouse_qty_before=Decimal("0"),
                warehouse_qty_after=Decimal("1"),
                produced_by="PG W2 legacy actor",
                producer_employee_id=actor_id,
                inventory_effect=[
                    {
                        "scope": "warehouse",
                        "row_id": str(inventory_id),
                        "before_quantity": 0,
                        "after_quantity": 1,
                        "delta": 1,
                    },
                    {
                        "scope": "warehouse_unplaced",
                        "row_id": str(unplaced_id),
                        "before_quantity": 0,
                        "after_quantity": 1,
                        "delta": 1,
                    },
                ],
            )
            setup.add(log)
            setup.commit()
            log_id = log.log_id

        monkeypatch.setattr(
            transaction_actions.operation_svc,
            "is_ledger_active",
            lambda *_args, **_kwargs: False,
        )
        monkeypatch.setattr(
            warehouse_map_service,
            "lock_warehouse_map_rows",
            coordinated_map_lock,
        )

        def cancel() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                actor = db.get(Employee, actor_id)
                log = db.get(TransactionLog, log_id)
                assert actor is not None and log is not None
                thread_roles[get_ident()] = "cancel"
                try:
                    transaction_actions.cancel_transaction(
                        db,
                        log=log,
                        canceller=actor,
                        reason="PostgreSQL legacy cancel placement race",
                        request=None,
                    )
                    return "cancel", True
                except ValueError:
                    db.rollback()
                    return "cancel", False
                finally:
                    thread_roles.pop(get_ident(), None)

        def place() -> tuple[str, bool]:
            with Session(engine) as db:
                db.execute(text("SET LOCAL statement_timeout = '5s'"))
                db.execute(
                    text("SELECT item_id FROM items WHERE item_id = :item_id FOR UPDATE"),
                    {"item_id": item_id.hex},
                ).one()
                placement_has_item_lock.set()
                if not cancel_at_physical_lock.wait(timeout=5):
                    raise TimeoutError("legacy cancellation did not reach the physical ledger")
                try:
                    warehouse_map_service._replace_box_items(
                        db,
                        box_id,
                        [SimpleNamespace(item_id=item_id, quantity=1)],
                    )
                    db.commit()
                    return "placement", True
                except ValueError:
                    db.rollback()
                    return "placement", False

        with ThreadPoolExecutor(max_workers=2) as executor:
            futures = [executor.submit(cancel), executor.submit(place)]
            outcomes = [future.result(timeout=10) for future in futures]
        assert sum(succeeded for _name, succeeded in outcomes) == 1

        with engine.connect() as verify:
            state = verify.execute(
                text(
                    """SELECT inventory.warehouse_qty,
                    warehouse_unplaced_items.quantity AS unplaced_qty,
                    COALESCE((
                        SELECT SUM(quantity) FROM warehouse_box_items
                        WHERE item_id = inventory.item_id
                    ), 0) AS box_qty,
                    transaction_logs.cancelled
                    FROM inventory
                    JOIN warehouse_unplaced_items
                      ON warehouse_unplaced_items.item_id = inventory.item_id
                    JOIN transaction_logs
                      ON transaction_logs.item_id = inventory.item_id
                    WHERE inventory.item_id = :item_id"""
                ),
                {"item_id": item_id.hex},
            ).one()
        assert int(state.warehouse_qty) == int(state.box_qty) + int(state.unplaced_qty)
        assert (bool(state.cancelled), int(state.box_qty)) in {(True, 0), (False, 1)}
    finally:
        _cleanup_public_ledger_fixture(
            engine,
            item_id=item_id,
            actor_id=actor_id,
            box_id=box_id,
            angle_id=angle_id,
        )
        engine.dispose()


class _ScalarResult:
    def __init__(self, rows=()):
        self._rows = list(rows)

    def scalars(self):
        return self

    def all(self):
        return list(self._rows)


class _RecordingQuery:
    def __init__(self, rows):
        self._rows = rows

    def join(self, *args, **kwargs):
        return self

    def filter(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def all(self):
        return self._rows


class _RecordingSession:
    def __init__(
        self,
        *,
        dialect_name="postgresql",
        discovered_box_ids=(),
        discovered_angle_ids=(),
        depletion_rows=(),
    ):
        self._bind = SimpleNamespace(dialect=SimpleNamespace(name=dialect_name))
        self.discovered_box_ids = list(discovered_box_ids)
        self.discovered_angle_ids = list(discovered_angle_ids)
        self.depletion_rows = list(depletion_rows)
        self.statements = []
        self.flush_count = 0

    def get_bind(self):
        return self._bind

    def execute(self, statement):
        self.statements.append(statement)
        sql = _compile_postgres(statement)
        if (
            "warehouse_box_items.box_id" in sql
            and "from warehouse_box_items" in sql
            and "for update" not in sql
        ):
            return _ScalarResult(self.discovered_box_ids)
        if (
            "warehouse_boxes.angle_id" in sql
            and "from warehouse_boxes" in sql
            and "for update" not in sql
        ):
            return _ScalarResult(self.discovered_angle_ids)
        return _ScalarResult()

    def query(self, *entities):
        assert entities == (WarehouseBoxItem,)
        return _RecordingQuery(self.depletion_rows)

    def flush(self):
        self.flush_count += 1


def _compile_postgres(statement) -> str:
    return " ".join(
        str(statement.compile(dialect=postgresql.dialect())).split()
    ).lower()


def _locking_statements(session: _RecordingSession):
    return [
        statement
        for statement in session.statements
        if "for update" in _compile_postgres(statement)
    ]


def test_postgres_shared_lock_orders_items_inventory_angles_boxes_then_contents():
    item_a = uuid.UUID(int=1)
    item_b = uuid.UUID(int=2)
    box_a = uuid.UUID(int=3)
    box_b = uuid.UUID(int=4)
    angle_a = 10
    angle_b = 20
    source_angle = 30
    session = _RecordingSession(
        discovered_box_ids=[box_b],
        discovered_angle_ids=[source_angle, angle_a],
    )

    warehouse_map_service.lock_warehouse_map_rows(
        session,
        item_ids=[item_b, item_a, item_b],
        angle_ids=[angle_b, angle_a, angle_b],
        box_ids=[box_b, box_a],
        include_boxes_for_item_ids=True,
    )

    statements = _locking_statements(session)
    sql = [_compile_postgres(statement) for statement in statements]
    assert len(statements) == 6
    assert "from items" in sql[0]
    assert "order by items.item_id" in sql[0]
    assert "for update of items" in sql[0]
    assert "from inventory" in sql[1]
    assert "order by inventory.item_id" in sql[1]
    assert "for update of inventory" in sql[1]
    assert "from warehouse_unplaced_items" in sql[2]
    assert "order by warehouse_unplaced_items.item_id" in sql[2]
    assert "for update of warehouse_unplaced_items" in sql[2]
    assert "from warehouse_angles" in sql[3]
    assert "where warehouse_angles.id in" in sql[3]
    assert "order by warehouse_angles.id" in sql[3]
    assert "for update of warehouse_angles" in sql[3]
    assert "from warehouse_boxes" in sql[4]
    assert "order by warehouse_boxes.box_id" in sql[4]
    assert "for update of warehouse_boxes" in sql[4]
    assert "from warehouse_box_items" in sql[5]
    assert (
        "order by warehouse_box_items.box_id asc, warehouse_box_items.item_id asc, "
        "warehouse_box_items.id asc"
    ) in sql[5]
    assert "for update of warehouse_box_items" in sql[5]

    compiled = [statement.compile(dialect=postgresql.dialect()) for statement in statements]
    assert compiled[0].params["item_id_1"] == [item_a, item_b]
    assert compiled[1].params["item_id_1"] == [item_a, item_b]
    assert compiled[2].params["item_id_1"] == [item_a, item_b]
    assert compiled[3].params["id_1"] == [angle_a, angle_b, source_angle]
    assert compiled[4].params["box_id_1"] == [box_a, box_b]
    assert compiled[5].params["box_id_1"] == [box_a, box_b]


def test_sqlite_shared_lock_is_noop():
    session = _RecordingSession(dialect_name="sqlite")

    warehouse_map_service.lock_warehouse_map_rows(
        session,
        item_ids=[uuid.uuid4()],
        angle_ids=[1],
        box_ids=[uuid.uuid4()],
        include_boxes_for_item_ids=True,
    )

    assert session.statements == []


def test_direct_deplete_locks_inventory_boxes_and_contents_before_r1_depletion():
    item_id = uuid.UUID(int=10)
    box_id = uuid.UUID(int=20)
    content = SimpleNamespace(box_id=box_id, item_id=item_id, quantity=2)
    session = _RecordingSession(
        discovered_box_ids=[box_id],
        discovered_angle_ids=[7],
        depletion_rows=[content],
    )

    warehouse_map_service._deplete_boxes_by_order(session, item_id, 1)

    statements = _locking_statements(session)
    assert [
        "items" if "from items" in _compile_postgres(statement)
        else "inventory" if "from inventory" in _compile_postgres(statement)
        else "unplaced" if "from warehouse_unplaced_items" in _compile_postgres(statement)
        else "angles" if "from warehouse_angles" in _compile_postgres(statement)
        else "boxes" if "from warehouse_boxes" in _compile_postgres(statement)
        else "contents"
        for statement in statements
    ] == ["items", "inventory", "unplaced", "angles", "boxes", "contents"]
    assert content.quantity == 1
    assert session.flush_count == 1


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL R1 실제 잠금 테스트를 건너뜁니다.",
)
def test_postgres_concurrent_admin_moves_serialize_target_capacity_and_stack_order(
    monkeypatch,
):
    """주의: TEST_POSTGRES_URL에는 폐기 가능한 전용 PostgreSQL 테스트 DB만 지정한다."""
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    if engine.dialect.name != "postgresql":
        pytest.fail("TEST_POSTGRES_URL must point to a dedicated PostgreSQL test database")

    schema_name = f"test_r1_lock_{uuid.uuid4().hex}"
    quoted_schema = f'"{schema_name}"'
    item_a = uuid.uuid4()
    item_b = uuid.uuid4()
    inventory_a = uuid.uuid4()
    inventory_b = uuid.uuid4()
    box_a = uuid.uuid4()
    box_b = uuid.uuid4()
    content_a = uuid.uuid4()
    content_b = uuid.uuid4()
    session_b = None
    schema_created = False
    commit_reached = Event()
    allow_commit = Event()

    monkeypatch.setattr(
        boxes_router,
        "_box_response",
        lambda _db, box_id: {"box_id": str(box_id)},
    )

    try:
        with engine.begin() as setup:
            setup.execute(text(f"CREATE SCHEMA {quoted_schema}"))
            schema_created = True
            setup.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_angles (
                        id INTEGER PRIMARY KEY,
                        label VARCHAR(50) NOT NULL,
                        angle_type VARCHAR(20) NOT NULL,
                        rows INTEGER NOT NULL,
                        layers INTEGER NOT NULL,
                        jaris_per_cell INTEGER NOT NULL,
                        pos_x INTEGER NOT NULL,
                        pos_y INTEGER NOT NULL,
                        width INTEGER NOT NULL,
                        height INTEGER NOT NULL,
                        display_order INTEGER NOT NULL,
                        is_active BOOLEAN NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE items (
                        item_id VARCHAR(32) PRIMARY KEY
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE inventory (
                        inventory_id VARCHAR(32) PRIMARY KEY,
                        item_id VARCHAR(32) NOT NULL UNIQUE,
                        quantity NUMERIC(18, 3) NOT NULL,
                        warehouse_qty NUMERIC(18, 3) NOT NULL,
                        pending_quantity NUMERIC(18, 3) NOT NULL,
                        last_reserver_employee_id VARCHAR(32),
                        last_reserver_name VARCHAR(100),
                        location VARCHAR(100),
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_unplaced_items (
                        id VARCHAR(32) PRIMARY KEY,
                        item_id VARCHAR(32) NOT NULL UNIQUE,
                        quantity INTEGER NOT NULL CHECK (quantity >= 0)
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_boxes (
                        box_id VARCHAR(32) PRIMARY KEY,
                        angle_id INTEGER NOT NULL,
                        row_no INTEGER NOT NULL,
                        layer_no INTEGER NOT NULL,
                        jari_index INTEGER NOT NULL,
                        size VARCHAR(20) NOT NULL,
                        stack_order INTEGER NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_box_items (
                        id VARCHAR(32) PRIMARY KEY,
                        box_id VARCHAR(32) NOT NULL
                            REFERENCES warehouse_boxes(box_id) ON DELETE CASCADE,
                        item_id VARCHAR(32) NOT NULL,
                        quantity INTEGER NOT NULL CHECK (quantity >= 0)
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_angles (
                        id, label, angle_type, rows, layers, jaris_per_cell,
                        pos_x, pos_y, width, height, display_order, is_active
                    )
                    VALUES (:id, :label, 'angle', 2, 2, 3, 0, 0, 72, 60, :id, true)
                    """
                ),
                [
                    {"id": 1, "label": "source-a"},
                    {"id": 2, "label": "source-b"},
                    {"id": 3, "label": "target"},
                ],
            )
            setup.execute(
                text(
                    """
                    INSERT INTO items (item_id)
                    VALUES (:item_id)
                    """
                ),
                [
                    {"item_id": item_a.hex},
                    {"item_id": item_b.hex},
                ],
            )
            setup.execute(
                text(
                    """
                    INSERT INTO inventory (
                        inventory_id, item_id, quantity, warehouse_qty,
                        pending_quantity
                    )
                    VALUES (:inventory_id, :item_id, 2, 2, 0)
                    """
                ),
                [
                    {"inventory_id": inventory_a.hex, "item_id": item_a.hex},
                    {"inventory_id": inventory_b.hex, "item_id": item_b.hex},
                ],
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_unplaced_items (id, item_id, quantity)
                    VALUES (:id, :item_id, 0)
                    """
                ),
                [
                    {"id": uuid.uuid4().hex, "item_id": item_a.hex},
                    {"id": uuid.uuid4().hex, "item_id": item_b.hex},
                ],
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_boxes
                        (box_id, angle_id, row_no, layer_no, jari_index, size, stack_order)
                    VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)
                    """
                ),
                [
                    {"box_id": box_a.hex, "angle_id": 1},
                    {"box_id": box_b.hex, "angle_id": 2},
                ],
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_box_items (id, box_id, item_id, quantity)
                    VALUES (:id, :box_id, :item_id, 2)
                    """
                ),
                [
                    {"id": content_a.hex, "box_id": box_a.hex, "item_id": item_a.hex},
                    {"id": content_b.hex, "box_id": box_b.hex, "item_id": item_b.hex},
                ],
            )

        target = WarehouseBoxMove(angle_id=3, row_no=1, layer_no=1, jari_index=0)

        def move_first_box():
            session_a = Session(engine)
            try:
                session_a.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
                original_commit = session_a.commit

                def pause_before_commit():
                    commit_reached.set()
                    if not allow_commit.wait(timeout=5):
                        raise TimeoutError("admin move commit was not released")
                    original_commit()

                session_a.commit = pause_before_commit
                return boxes_router.move_box(
                    str(box_a),
                    target,
                    None,
                    session_a,
                )
            finally:
                session_a.close()

        with ThreadPoolExecutor(max_workers=1) as executor:
            first_move = executor.submit(move_first_box)
            assert commit_reached.wait(timeout=5)

            session_b = Session(engine)
            session_b.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
            session_b.execute(text("SET LOCAL lock_timeout = '100ms'"))
            with pytest.raises(OperationalError) as exc_info:
                boxes_router.move_box(str(box_b), target, None, session_b)
            assert "lock timeout" in str(exc_info.value).lower()
            session_b.rollback()

            allow_commit.set()
            assert first_move.result(timeout=5)["box_id"] == str(box_a)

        session_b.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
        session_b.execute(text("SET LOCAL lock_timeout = '100ms'"))
        assert boxes_router.move_box(str(box_b), target, None, session_b)["box_id"] == str(box_b)

        session_b.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
        target_rows = session_b.execute(
            text(
                """
                SELECT box_id, stack_order
                FROM warehouse_boxes
                WHERE angle_id = 3 AND row_no = 1 AND layer_no = 1 AND jari_index = 0
                ORDER BY stack_order
                """
            )
        ).all()
        assert [row.stack_order for row in target_rows] == [1, 2]
        assert {row.box_id for row in target_rows} == {box_a.hex, box_b.hex}
    finally:
        if session_b is not None:
            session_b.close()
        if schema_created:
            with engine.begin() as cleanup:
                cleanup.execute(text(f"DROP SCHEMA IF EXISTS {quoted_schema} CASCADE"))
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL R1 실제 잠금 테스트를 건너뜁니다.",
)
def test_postgres_outbound_blocks_actual_admin_move_until_commit(monkeypatch):
    """실제 출고와 관리자 이동이 같은 재고/박스 잠금 계약을 공유한다."""
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    if engine.dialect.name != "postgresql":
        pytest.fail("TEST_POSTGRES_URL must point to a dedicated PostgreSQL test database")

    schema_name = f"test_r1_outbound_lock_{uuid.uuid4().hex}"
    quoted_schema = f'"{schema_name}"'
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    box_id = uuid.uuid4()
    content_id = uuid.uuid4()
    session_a = None
    session_b = None
    schema_created = False

    monkeypatch.setattr(
        boxes_router,
        "_box_response",
        lambda _db, response_box_id: {"box_id": str(response_box_id)},
    )

    try:
        with engine.begin() as setup:
            setup.execute(text(f"CREATE SCHEMA {quoted_schema}"))
            schema_created = True
            setup.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_angles (
                        id INTEGER PRIMARY KEY,
                        label VARCHAR(50) NOT NULL,
                        angle_type VARCHAR(20) NOT NULL,
                        rows INTEGER NOT NULL,
                        layers INTEGER NOT NULL,
                        jaris_per_cell INTEGER NOT NULL,
                        pos_x INTEGER NOT NULL,
                        pos_y INTEGER NOT NULL,
                        width INTEGER NOT NULL,
                        height INTEGER NOT NULL,
                        display_order INTEGER NOT NULL,
                        is_active BOOLEAN NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE items (
                        item_id VARCHAR(32) PRIMARY KEY
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE inventory (
                        inventory_id VARCHAR(32) PRIMARY KEY,
                        item_id VARCHAR(32) NOT NULL UNIQUE,
                        quantity INTEGER NOT NULL,
                        warehouse_qty INTEGER NOT NULL,
                        pending_quantity INTEGER NOT NULL,
                        last_reserver_employee_id VARCHAR(32),
                        last_reserver_name VARCHAR(100),
                        location VARCHAR(100),
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_unplaced_items (
                        id VARCHAR(32) PRIMARY KEY,
                        item_id VARCHAR(32) NOT NULL UNIQUE,
                        quantity INTEGER NOT NULL CHECK (quantity >= 0)
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_special_zones (
                        id INTEGER PRIMARY KEY,
                        label VARCHAR(50) NOT NULL,
                        zone_type VARCHAR(20) NOT NULL,
                        pos_x INTEGER NOT NULL,
                        pos_y INTEGER NOT NULL,
                        width INTEGER NOT NULL,
                        height INTEGER NOT NULL,
                        display_order INTEGER NOT NULL,
                        is_active BOOLEAN NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_special_zone_items (
                        id VARCHAR(32) PRIMARY KEY,
                        zone_id INTEGER NOT NULL
                            REFERENCES warehouse_special_zones(id) ON DELETE CASCADE,
                        item_id VARCHAR(32) NOT NULL,
                        quantity INTEGER NOT NULL CHECK (quantity >= 0)
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE inventory_locations (
                        location_id VARCHAR(32) PRIMARY KEY,
                        item_id VARCHAR(32) NOT NULL,
                        department VARCHAR(50) NOT NULL,
                        status VARCHAR(20) NOT NULL,
                        quantity INTEGER NOT NULL,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        defective_at TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE shipping_allocations (
                        allocation_id VARCHAR(32) PRIMARY KEY,
                        request_id VARCHAR(32) NOT NULL,
                        item_id VARCHAR(32) NOT NULL,
                        quantity INTEGER NOT NULL,
                        unit VARCHAR(20),
                        department VARCHAR(50),
                        status VARCHAR(20) NOT NULL,
                        reference_no VARCHAR(100),
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        released_at TIMESTAMP,
                        consumed_at TIMESTAMP,
                        released_reason VARCHAR(300)
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE system_settings (
                        setting_key VARCHAR(100) PRIMARY KEY,
                        setting_value TEXT NOT NULL,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_boxes (
                        box_id VARCHAR(32) PRIMARY KEY,
                        angle_id INTEGER NOT NULL,
                        row_no INTEGER NOT NULL,
                        layer_no INTEGER NOT NULL,
                        jari_index INTEGER NOT NULL,
                        size VARCHAR(20) NOT NULL,
                        stack_order INTEGER NOT NULL,
                        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    CREATE TABLE warehouse_box_items (
                        id VARCHAR(32) PRIMARY KEY,
                        box_id VARCHAR(32) NOT NULL
                            REFERENCES warehouse_boxes(box_id) ON DELETE CASCADE,
                        item_id VARCHAR(32) NOT NULL,
                        quantity INTEGER NOT NULL CHECK (quantity >= 0)
                    )
                    """
                )
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_angles (
                        id, label, angle_type, rows, layers, jaris_per_cell,
                        pos_x, pos_y, width, height, display_order, is_active
                    )
                    VALUES (:id, :label, 'angle', 2, 2, 3, 0, 0, 72, 60, :id, true)
                    """
                ),
                [
                    {"id": 1, "label": "source"},
                    {"id": 2, "label": "target"},
                ],
            )
            setup.execute(
                text(
                    """
                    INSERT INTO items (item_id) VALUES (:item_id)
                    """
                ),
                {"item_id": item_id.hex},
            )
            setup.execute(
                text(
                    """
                    INSERT INTO inventory (
                        inventory_id, item_id, quantity, warehouse_qty,
                        pending_quantity
                    )
                    VALUES (:inventory_id, :item_id, 2, 2, 0)
                    """
                ),
                {"inventory_id": inventory_id.hex, "item_id": item_id.hex},
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_unplaced_items (id, item_id, quantity)
                    VALUES (:id, :item_id, 0)
                    """
                ),
                {"id": uuid.uuid4().hex, "item_id": item_id.hex},
            )
            setup.execute(
                text(
                    """
                    INSERT INTO system_settings (setting_key, setting_value)
                    VALUES ('warehouse_box_tracking_enabled', 'true')
                    """
                )
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_boxes (
                        box_id, angle_id, row_no, layer_no, jari_index,
                        size, stack_order
                    )
                    VALUES (:box_id, 1, 1, 1, 0, 'SMALL', 0)
                    """
                ),
                {"box_id": box_id.hex},
            )
            setup.execute(
                text(
                    """
                    INSERT INTO warehouse_box_items (id, box_id, item_id, quantity)
                    VALUES (:id, :box_id, :item_id, 2)
                    """
                ),
                {
                    "id": content_id.hex,
                    "box_id": box_id.hex,
                    "item_id": item_id.hex,
                },
            )

        session_a = Session(engine)
        session_b = Session(engine)
        session_a.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
        session_b.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
        assert session_a.execute(text("SELECT pg_backend_pid()")).scalar_one() != (
            session_b.execute(text("SELECT pg_backend_pid()")).scalar_one()
        )

        _consume_warehouse(session_a, item_id, 1)
        assert (
            session_a.query(WarehouseBoxItem.quantity)
            .filter(WarehouseBoxItem.box_id == box_id)
            .scalar()
            == 1
        )

        target = WarehouseBoxMove(angle_id=2, row_no=2, layer_no=1, jari_index=1)
        session_b.execute(text("SET LOCAL lock_timeout = '100ms'"))
        with pytest.raises(OperationalError) as exc_info:
            boxes_router.move_box(str(box_id), target, None, session_b)
        assert "lock timeout" in str(exc_info.value).lower()
        session_b.rollback()

        session_a.commit()

        session_b.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
        session_b.execute(text("SET LOCAL lock_timeout = '100ms'"))
        assert boxes_router.move_box(str(box_id), target, None, session_b)["box_id"] == str(box_id)

        session_b.execute(text(f"SET LOCAL search_path TO {quoted_schema}"))
        final = session_b.execute(
            text(
                """
                SELECT
                    inventory.warehouse_qty,
                    inventory.quantity,
                    warehouse_box_items.quantity AS box_qty,
                    warehouse_unplaced_items.quantity AS unplaced_qty,
                    warehouse_boxes.angle_id,
                    warehouse_boxes.row_no,
                    warehouse_boxes.layer_no,
                    warehouse_boxes.jari_index
                FROM inventory
                JOIN warehouse_box_items
                    ON warehouse_box_items.item_id = inventory.item_id
                JOIN warehouse_boxes
                    ON warehouse_boxes.box_id = warehouse_box_items.box_id
                JOIN warehouse_unplaced_items
                    ON warehouse_unplaced_items.item_id = inventory.item_id
                WHERE inventory.item_id = :item_id
                """
            ),
            {"item_id": item_id.hex},
        ).one()
        assert final.warehouse_qty == final.quantity == final.box_qty == 1
        assert final.unplaced_qty == 0
        assert final.warehouse_qty >= 0
        assert final.box_qty >= 0
        assert (final.angle_id, final.row_no, final.layer_no, final.jari_index) == (
            2,
            2,
            1,
            1,
        )
    finally:
        if session_b is not None:
            session_b.close()
        if session_a is not None:
            session_a.close()
        if schema_created:
            with engine.begin() as cleanup:
                cleanup.execute(text(f"DROP SCHEMA IF EXISTS {quoted_schema} CASCADE"))
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL stale box-item 검증을 건너뜁니다.",
)
def test_postgres_delete_box_rejects_item_added_before_canonical_lock(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A B row discovered after the outer snapshot must cause 409, not box→W lock."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_a = uuid.uuid4()
    item_b = uuid.uuid4()
    inventory_a = uuid.uuid4()
    inventory_b = uuid.uuid4()
    unplaced_a = uuid.uuid4()
    unplaced_b = uuid.uuid4()
    box_id = uuid.uuid4()
    row_a = uuid.uuid4()
    row_b = uuid.uuid4()
    angle_id: int | None = None
    lock_snapshot_read = Event()
    allow_lock = Event()
    original_lock = warehouse_map_service.lock_warehouse_map_rows

    def pause_first_lock(*args, **kwargs):
        if not lock_snapshot_read.is_set():
            lock_snapshot_read.set()
            if not allow_lock.wait(timeout=5):
                raise TimeoutError("stale box lock was not released")
        return original_lock(*args, **kwargs)

    monkeypatch.setattr(
        warehouse_map_service,
        "lock_warehouse_map_rows",
        pause_first_lock,
    )
    try:
        with engine.begin() as setup:
            _insert_public_ledger_item(
                setup,
                item_id=item_a,
                inventory_id=inventory_a,
                unplaced_id=unplaced_a,
                warehouse_quantity=1,
                unplaced_quantity=0,
            )
            _insert_public_ledger_item(
                setup,
                item_id=item_b,
                inventory_id=inventory_b,
                unplaced_id=unplaced_b,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )
            angle_id = _insert_public_angle(
                setup,
                label=f"stale-box-{uuid.uuid4().hex[:8]}",
            )
            setup.execute(
                text(
                    """INSERT INTO warehouse_boxes (
                        box_id, angle_id, row_no, layer_no, jari_index,
                        size, stack_order
                    ) VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)"""
                ),
                {"box_id": box_id.hex, "angle_id": angle_id},
            )
            setup.execute(
                text(
                    """INSERT INTO warehouse_box_items
                    (id, box_id, item_id, quantity)
                    VALUES (:id, :box_id, :item_id, 1)"""
                ),
                {"id": row_a.hex, "box_id": box_id.hex, "item_id": item_a.hex},
            )

        def delete_in_first_session() -> None:
            session = Session(engine)
            try:
                boxes_router.delete_box(str(box_id), None, session)
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=1) as executor:
            deletion = executor.submit(delete_in_first_session)
            assert lock_snapshot_read.wait(timeout=5)
            with engine.begin() as concurrent_insert:
                concurrent_insert.execute(
                    text(
                        "UPDATE warehouse_unplaced_items SET quantity = 0 "
                        "WHERE item_id = :item_id"
                    ),
                    {"item_id": item_b.hex},
                )
                concurrent_insert.execute(
                    text(
                        """INSERT INTO warehouse_box_items
                        (id, box_id, item_id, quantity)
                        VALUES (:id, :box_id, :item_id, 1)"""
                    ),
                    {
                        "id": row_b.hex,
                        "box_id": box_id.hex,
                        "item_id": item_b.hex,
                    },
                )
            allow_lock.set()
            with pytest.raises(HTTPException) as exc_info:
                deletion.result(timeout=5)
            assert exc_info.value.status_code == 409

        with engine.connect() as verify:
            assert verify.execute(
                text(
                    "SELECT COUNT(*) FROM warehouse_box_items "
                    "WHERE box_id = :box_id"
                ),
                {"box_id": box_id.hex},
            ).scalar_one() == 2
            ledgers = verify.execute(
                text(
                    """SELECT inventory.item_id, inventory.warehouse_qty,
                    warehouse_unplaced_items.quantity AS unplaced_quantity,
                    COALESCE(SUM(warehouse_box_items.quantity), 0) AS box_quantity
                    FROM inventory
                    JOIN warehouse_unplaced_items
                      ON warehouse_unplaced_items.item_id = inventory.item_id
                    LEFT JOIN warehouse_box_items
                      ON warehouse_box_items.item_id = inventory.item_id
                    WHERE inventory.item_id IN (:item_a, :item_b)
                    GROUP BY inventory.item_id, inventory.warehouse_qty,
                             warehouse_unplaced_items.quantity
                    ORDER BY inventory.item_id"""
                ),
                {"item_a": item_a.hex, "item_b": item_b.hex},
            ).all()
            assert all(
                row.warehouse_qty == row.box_quantity + row.unplaced_quantity
                for row in ledgers
            )
    finally:
        allow_lock.set()
        with engine.begin() as cleanup:
            cleanup.execute(
                text("DELETE FROM warehouse_boxes WHERE box_id = :box_id"),
                {"box_id": box_id.hex},
            )
            cleanup.execute(
                text(
                    "DELETE FROM warehouse_unplaced_items "
                    "WHERE item_id IN (:item_a, :item_b)"
                ),
                {"item_a": item_a.hex, "item_b": item_b.hex},
            )
            cleanup.execute(
                text(
                    "DELETE FROM inventory WHERE item_id IN (:item_a, :item_b)"
                ),
                {"item_a": item_a.hex, "item_b": item_b.hex},
            )
            cleanup.execute(
                text("DELETE FROM items WHERE item_id IN (:item_a, :item_b)"),
                {"item_a": item_a.hex, "item_b": item_b.hex},
            )
            if angle_id is not None:
                cleanup.execute(
                    text("DELETE FROM warehouse_angles WHERE id = :angle_id"),
                    {"angle_id": angle_id},
                )
        engine.dispose()


@pytest.mark.skipif(
    not TEST_POSTGRES_URL,
    reason="TEST_POSTGRES_URL이 없어 PostgreSQL angle delete 경쟁 검증을 건너뜁니다.",
)
def test_postgres_delete_angle_rechecks_boxes_after_concurrent_create() -> None:
    """Angle deletion must see a box committed while waiting for the angle lock."""
    assert os.environ.get("DEXCOWIN_POSTGRES_TEST_ACK") == "ALLOW_TEST_DB_MUTATION"
    engine = create_engine(TEST_POSTGRES_URL, poolclass=NullPool)
    item_id = uuid.uuid4()
    inventory_id = uuid.uuid4()
    unplaced_id = uuid.uuid4()
    box_id = uuid.uuid4()
    row_id = uuid.uuid4()
    angle_id: int | None = None
    creator = Session(engine)
    delete_started = Event()
    application_name = f"angle_delete_{uuid.uuid4().hex}"
    try:
        with engine.begin() as setup:
            _insert_public_ledger_item(
                setup,
                item_id=item_id,
                inventory_id=inventory_id,
                unplaced_id=unplaced_id,
                warehouse_quantity=1,
                unplaced_quantity=1,
            )
            angle_id = _insert_public_angle(
                setup,
                label=f"delete-race-{uuid.uuid4().hex[:8]}",
            )

        creator.execute(
            text("SELECT id FROM warehouse_angles WHERE id = :id FOR UPDATE"),
            {"id": angle_id},
        ).one()
        creator.execute(
            text(
                "UPDATE warehouse_unplaced_items SET quantity = 0 "
                "WHERE item_id = :item_id"
            ),
            {"item_id": item_id.hex},
        )
        creator.execute(
            text(
                """INSERT INTO warehouse_boxes (
                    box_id, angle_id, row_no, layer_no, jari_index,
                    size, stack_order
                ) VALUES (:box_id, :angle_id, 1, 1, 0, 'SMALL', 0)"""
            ),
            {"box_id": box_id.hex, "angle_id": angle_id},
        )
        creator.execute(
            text(
                """INSERT INTO warehouse_box_items
                (id, box_id, item_id, quantity)
                VALUES (:id, :box_id, :item_id, 1)"""
            ),
            {"id": row_id.hex, "box_id": box_id.hex, "item_id": item_id.hex},
        )

        def delete_in_second_session() -> None:
            session = Session(engine)
            try:
                session.execute(
                    text("SELECT set_config('application_name', :name, true)"),
                    {"name": application_name},
                )
                delete_started.set()
                angles_router.delete_angle(int(angle_id), None, session)
            finally:
                session.close()

        with ThreadPoolExecutor(max_workers=1) as executor:
            deletion = executor.submit(delete_in_second_session)
            assert delete_started.wait(timeout=5)
            deadline = time.monotonic() + 5
            waiting_on_lock = False
            while time.monotonic() < deadline:
                with engine.connect() as observer:
                    waiting_on_lock = bool(
                        observer.execute(
                            text(
                                """SELECT 1 FROM pg_stat_activity
                                WHERE application_name = :name
                                  AND wait_event_type = 'Lock'"""
                            ),
                            {"name": application_name},
                        ).scalar_one_or_none()
                    )
                if waiting_on_lock or deletion.done():
                    break
                time.sleep(0.05)
            try:
                assert waiting_on_lock
            finally:
                creator.commit()

            with pytest.raises(HTTPException) as exc_info:
                deletion.result(timeout=5)
            assert exc_info.value.status_code == 409

        with engine.connect() as verify:
            assert verify.execute(
                text("SELECT COUNT(*) FROM warehouse_angles WHERE id = :id"),
                {"id": angle_id},
            ).scalar_one() == 1
            assert verify.execute(
                text("SELECT COUNT(*) FROM warehouse_boxes WHERE box_id = :id"),
                {"id": box_id.hex},
            ).scalar_one() == 1
            ledger = verify.execute(
                text(
                    """SELECT inventory.warehouse_qty,
                    warehouse_box_items.quantity AS box_quantity,
                    warehouse_unplaced_items.quantity AS unplaced_quantity
                    FROM inventory
                    JOIN warehouse_box_items
                      ON warehouse_box_items.item_id = inventory.item_id
                    JOIN warehouse_unplaced_items
                      ON warehouse_unplaced_items.item_id = inventory.item_id
                    WHERE inventory.item_id = :item_id"""
                ),
                {"item_id": item_id.hex},
            ).one()
            assert ledger.warehouse_qty == (
                ledger.box_quantity + ledger.unplaced_quantity
            )
    finally:
        if creator.in_transaction():
            creator.rollback()
        creator.close()
        with engine.begin() as cleanup:
            cleanup.execute(
                text("DELETE FROM warehouse_boxes WHERE box_id = :box_id"),
                {"box_id": box_id.hex},
            )
            cleanup.execute(
                text("DELETE FROM warehouse_unplaced_items WHERE item_id = :item_id"),
                {"item_id": item_id.hex},
            )
            cleanup.execute(
                text("DELETE FROM inventory WHERE item_id = :item_id"),
                {"item_id": item_id.hex},
            )
            cleanup.execute(
                text("DELETE FROM items WHERE item_id = :item_id"),
                {"item_id": item_id.hex},
            )
            if angle_id is not None:
                cleanup.execute(
                    text("DELETE FROM warehouse_angles WHERE id = :angle_id"),
                    {"angle_id": angle_id},
                )
        engine.dispose()
