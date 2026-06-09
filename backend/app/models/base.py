"""모델 공통 베이스 — Base / 공통 Enum / 공통 TypeDecorator.

`Base` 는 `app.database` 가 정의한 declarative_base 를 그대로 재export 하여
모듈 분리 전후로 metadata 정체성을 유지한다.
"""

import enum
import uuid as _uuid

from sqlalchemy import Integer, String
from sqlalchemy.types import TypeDecorator

from app.database import Base  # noqa: F401 — re-export

__all__ = [
    "Base",
    "BoolAsString",
    "IntQuantity",
    "UUIDString",
    "DepartmentEnum",
    "DeptAdjSubTypeEnum",
]


class BoolAsString(TypeDecorator):
    """DB 에는 'true'/'false' 문자열로, 애플리케이션에서는 bool 로 다룬다.

    기존 Employee.is_active 가 VARCHAR(5) 로 저장되는 관성을 유지하면서 ORM 레이어에서만
    bool 로 정규화. 스키마 변경 필요 없음.
    """

    impl = String(5)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            return "true" if value else "false"
        # 기존 문자열/정수 입력 호환
        if isinstance(value, str):
            return "true" if value.lower() in ("true", "1", "yes", "t") else "false"
        return "true" if bool(value) else "false"

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        return str(value).lower() in ("true", "1", "yes", "t")


class IntQuantity(TypeDecorator):
    """수량 전용 정수 타입 — 바인딩 시 Decimal/float/str 입력을 int 로 강제.

    전 품목 EA 단위라 수량엔 소수가 없다(소수 입력은 schemas 의 int 가 422 로 거부).
    서비스가 계산 편의로 Decimal 을 넘겨도 DB 에는 정수만 저장되도록 경계에서 강제한다.
    """

    impl = Integer
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        return int(value)


class UUIDString(TypeDecorator):
    """UUID 저장 타입 — SQLite에서 no-hyphen hex(32자)로 일관 저장·조회.

    PostgreSQL UUID dialect 는 write 시 no-hyphen hex 변환, read 시 raw 문자열 반환.
    이 타입은 양방향 정규화: 어떤 경로로 삽입되든 read 시 uuid.UUID 객체로 반환하며,
    write 시 hyphen 포함 문자열도 no-hyphen hex 로 강제해 포맷 혼재를 원천 차단.
    """

    impl = String(32)
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, _uuid.UUID):
            return value.hex
        return str(value).replace("-", "")

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if isinstance(value, _uuid.UUID):
            return value
        try:
            return _uuid.UUID(str(value))
        except (ValueError, AttributeError):
            return value


class DepartmentEnum(str, enum.Enum):
    ASSEMBLY = "조립"
    HIGH_VOLTAGE = "고압"
    VACUUM = "진공"
    TUNING = "튜닝"
    TUBE = "튜브"
    AS = "AS"
    RESEARCH = "연구"
    SALES = "영업"
    SHIPPING = "출하"
    ETC = "기타"
    WAREHOUSE = "창고"


class DeptAdjSubTypeEnum(str, enum.Enum):
    PRODUCTION = "production"    # 생산/조립
    DISASSEMBLY = "disassembly"  # 분해/회수
    CORRECTION = "correction"    # 수량 보정
