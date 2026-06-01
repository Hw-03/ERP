"""모델 공통 베이스 — Base / 공통 Enum / 공통 TypeDecorator.

`Base` 는 `app.database` 가 정의한 declarative_base 를 그대로 재export 하여
모듈 분리 전후로 metadata 정체성을 유지한다.
"""

import enum

from sqlalchemy import Integer, String
from sqlalchemy.types import TypeDecorator

from app.database import Base  # noqa: F401 — re-export

__all__ = [
    "Base",
    "BoolAsString",
    "IntQuantity",
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


class DeptAdjSubTypeEnum(str, enum.Enum):
    PRODUCTION = "production"    # 생산/조립
    DISASSEMBLY = "disassembly"  # 분해/회수
    CORRECTION = "correction"    # 수량 보정
