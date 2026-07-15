"""R1 차감 쿼리의 DB별 잠금 범위를 검증한다."""

from __future__ import annotations

import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.models import WarehouseBox, WarehouseBoxItem
from app.routers.warehouse_map import boxes as boxes_router
from app.schemas import WarehouseBoxMove
from app.services import warehouse_map as warehouse_map_service
from app.services.inventory import consume_warehouse


TEST_POSTGRES_URL = os.environ.get("TEST_POSTGRES_URL")


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


def test_postgres_shared_lock_orders_inventory_angles_boxes_then_contents():
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
    assert len(statements) == 4
    assert "from inventory" in sql[0]
    assert "order by inventory.item_id" in sql[0]
    assert "for update of inventory" in sql[0]
    assert "from warehouse_angles" in sql[1]
    assert "where warehouse_angles.id in" in sql[1]
    assert "order by warehouse_angles.id" in sql[1]
    assert "for update of warehouse_angles" in sql[1]
    assert "from warehouse_boxes" in sql[2]
    assert "order by warehouse_boxes.box_id" in sql[2]
    assert "for update of warehouse_boxes" in sql[2]
    assert "from warehouse_box_items" in sql[3]
    assert (
        "order by warehouse_box_items.box_id asc, warehouse_box_items.item_id asc, "
        "warehouse_box_items.id asc"
    ) in sql[3]
    assert "for update of warehouse_box_items" in sql[3]

    compiled = [statement.compile(dialect=postgresql.dialect()) for statement in statements]
    assert compiled[0].params["item_id_1"] == [item_a, item_b]
    assert compiled[1].params["id_1"] == [angle_a, angle_b, source_angle]
    assert compiled[2].params["box_id_1"] == [box_a, box_b]
    assert compiled[3].params["box_id_1"] == [box_a, box_b]


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

    warehouse_map_service.deplete_boxes_by_order(session, item_id, 1)

    statements = _locking_statements(session)
    assert [
        "inventory" if "from inventory" in _compile_postgres(statement)
        else "angles" if "from warehouse_angles" in _compile_postgres(statement)
        else "boxes" if "from warehouse_boxes" in _compile_postgres(statement)
        else "contents"
        for statement in statements
    ] == ["inventory", "angles", "boxes", "contents"]
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

        consume_warehouse(session_a, item_id, 1)
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
                    warehouse_boxes.angle_id,
                    warehouse_boxes.row_no,
                    warehouse_boxes.layer_no,
                    warehouse_boxes.jari_index
                FROM inventory
                JOIN warehouse_box_items
                    ON warehouse_box_items.item_id = inventory.item_id
                JOIN warehouse_boxes
                    ON warehouse_boxes.box_id = warehouse_box_items.box_id
                WHERE inventory.item_id = :item_id
                """
            ),
            {"item_id": item_id.hex},
        ).one()
        assert final.warehouse_qty == final.quantity == final.box_qty == 1
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
