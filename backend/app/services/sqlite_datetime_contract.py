"""SQLite 날짜 원문과 DateTime 처리기의 순서가 같은 범위만 SQL로 제한한다."""

import sqlite3

from sqlalchemy import LargeBinary, and_, cast, func, literal_column
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement


def supports_datetime_guard(db: Session) -> bool:
    """낮아진 함수 인자 제한에서는 검사 SQL 대신 기존 전체 조회를 사용한다."""
    if (db.get_bind().dialect.server_version_info or ()) < (3, 35, 0):
        return False
    connection = db.connection().connection.driver_connection
    getlimit = getattr(connection, "getlimit", None)
    return getlimit is not None and getlimit(sqlite3.SQLITE_LIMIT_FUNCTION_ARG) >= 3


def canonical_datetime(value: ColumnElement) -> ColumnElement[bool]:
    """SQLite DateTime의 고정폭 원문만 커서·MIN/MAX 문자열 비교에 허용한다."""
    date_part = func.substr(value, literal_column("1"), literal_column("19"))
    return and_(
        func.typeof(value) == literal_column("'text'"),
        # TEXT length/GLOB는 NUL에서 멈추므로 실제 원문 바이트 길이를 확인한다.
        func.length(cast(value, LargeBinary)) == literal_column("26"),
        value.op("GLOB")(literal_column("'" + "[0-9]" * 4 + "-" + "[0-9]" * 2 + "-" + "[0-9]" * 2
            + " " + "[0-9]" * 2 + ":" + "[0-9]" * 2 + ":" + "[0-9]" * 2 + "." + "[0-9]" * 6 + "'")),
        func.substr(value, literal_column("1"), literal_column("4")) != literal_column("'0000'"),
        # +0 days는 SQLite가 그대로 허용하는 2월 30일·24시도 정규화해 거부한다.
        func.strftime(literal_column("'%Y-%m-%d %H:%M:%S'"), date_part, literal_column("'+0 days'")) == date_part,
    )
