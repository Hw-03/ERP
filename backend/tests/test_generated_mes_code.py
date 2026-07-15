"""items.mes_code 생성열 검증 — DB 가 분해필드에서 계산, 직접 쓰기 거부, 변경 시 재계산."""

import pytest
from sqlalchemy.exc import OperationalError

from app.models import Item
from app.utils.mes_code import make_mes_code


def test_mes_code_auto_computed(db_session):
    item = Item(item_name="자동", process_type_code="AR", model_symbol="346", serial_no=1)
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    assert item.mes_code == "346-AR-0001"
    assert item.mes_code == make_mes_code("346", "AR", 1)


@pytest.mark.parametrize(
    ("serial_no", "expected"),
    [
        (1, "3-AR-0001"),
        (9999, "3-AR-9999"),
        (10000, "3-AR-10000"),
    ],
)
def test_mes_code_portable_padding_boundaries(db_session, serial_no, expected):
    item = Item(
        item_name=f"경계-{serial_no}",
        process_type_code="AR",
        model_symbol="3",
        serial_no=serial_no,
    )
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)

    assert item.mes_code == expected


@pytest.mark.parametrize(
    ("serial_no", "expected"),
    [(-1, "3-AR--001"), (0, "3-AR-0000")],
)
def test_serial_no_legacy_sqlite_formatting_is_preserved(
    db_session, serial_no, expected
):
    item = Item(
        item_name=f"거부-{serial_no}",
        process_type_code="AR",
        model_symbol="3",
        serial_no=serial_no,
    )
    db_session.add(item)

    db_session.commit()
    db_session.refresh(item)
    assert item.mes_code == expected


def test_mes_code_recomputed_on_serial_change(db_session):
    item = Item(item_name="재계산", process_type_code="AR", model_symbol="3", serial_no=1)
    db_session.add(item)
    db_session.commit()
    db_session.refresh(item)
    assert item.mes_code == "3-AR-0001"

    item.serial_no = 2
    db_session.commit()
    db_session.refresh(item)
    assert item.mes_code == "3-AR-0002"


def test_direct_mes_code_write_rejected(db_session):
    """생성열에 직접 INSERT 시도 → SQLite 가 거부."""
    item = Item(
        item_name="강제", process_type_code="AR", model_symbol="3", serial_no=1,
        mes_code="FORCED",
    )
    db_session.add(item)
    with pytest.raises(OperationalError):
        db_session.flush()
    db_session.rollback()
