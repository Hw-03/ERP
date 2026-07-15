"""시스템 설정 키-값 저장."""

from datetime import datetime

from sqlalchemy import CHAR, Column, DateTime, ForeignKey, String, Text, func
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator, TypeEngine

from app.models.base import Base, UUIDString

__all__ = ["ModelPfPin", "SystemSetting"]


class _ModelPfSymbolType(TypeDecorator):
    """Keep the pre-Alembic SQLite TEXT declaration without changing PostgreSQL."""

    impl = String(20)
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine:
        if dialect.name == "sqlite":
            return dialect.type_descriptor(Text())
        return dialect.type_descriptor(String(20))


class _ModelPfItemIdType(UUIDString):
    """Use legacy SQLite CHAR(36) while retaining UUIDString processors."""

    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine:
        if dialect.name == "sqlite":
            return dialect.type_descriptor(CHAR(36))
        return super().load_dialect_impl(dialect)


class _ModelPfUpdatedAtType(TypeDecorator):
    """Round-trip datetimes through the legacy SQLite TEXT timestamp column."""

    impl = DateTime
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine:
        if dialect.name == "sqlite":
            return dialect.type_descriptor(Text())
        return dialect.type_descriptor(DateTime())

    def process_bind_param(
        self,
        value: datetime | None,
        dialect: Dialect,
    ) -> datetime | str | None:
        if value is not None and dialect.name == "sqlite":
            return value.isoformat(sep=" ")
        return value

    def process_result_value(
        self,
        value: datetime | str | None,
        dialect: Dialect,
    ) -> datetime | None:
        if isinstance(value, str) and dialect.name == "sqlite":
            return datetime.fromisoformat(value)
        return value


class ModelPfPin(Base):
    """모델 기호별 기준 PF 품목 지정."""

    __tablename__ = "model_pf_pins"

    model_symbol = Column(_ModelPfSymbolType(), primary_key=True)
    pf_item_id = Column(
        _ModelPfItemIdType(),
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
    )
    updated_at = Column(
        _ModelPfUpdatedAtType(),
        nullable=False,
        server_default=func.now(),
    )


class SystemSetting(Base):
    __tablename__ = "system_settings"

    setting_key = Column(String(100), primary_key=True)
    setting_value = Column(Text, nullable=False)
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )
