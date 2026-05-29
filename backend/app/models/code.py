"""제품 코드·공정 코드 마스터 (ProductSymbol / OptionCode / ProcessType)."""

from sqlalchemy import (
    Boolean,
    Column,
    Integer,
    SmallInteger,
    String,
    Text,
)

from app.models.base import Base

__all__ = [
    "ProductSymbol",
    "OptionCode",
    "ProcessType",
]


class ProductSymbol(Base):
    __tablename__ = "product_symbols"

    slot = Column(SmallInteger, primary_key=True)  # 1 ~ 100
    symbol = Column(String(5), nullable=True, unique=True, index=True)
    model_name = Column(String(50), nullable=True)
    # Finished goods (PA/AA) must use a single-slot symbol; this flag marks it
    is_finished_good = Column(Boolean, nullable=False, default=False)
    is_reserved = Column(Boolean, nullable=False, default=True)
    notes = Column(Text, nullable=True)
    # 모델 관리 화면 표시 순서 (드래그 reorder 결과 저장). 기본값은 slot 과 동일하게 백필됨.
    display_order = Column(Integer, nullable=False, default=0, server_default="0")


class OptionCode(Base):
    __tablename__ = "option_codes"

    code = Column(String(2), primary_key=True)
    label_ko = Column(String(50), nullable=False)
    label_en = Column(String(50), nullable=True)
    color_hex = Column(String(7), nullable=True)


class ProcessType(Base):
    __tablename__ = "process_types"

    code = Column(String(2), primary_key=True)   # TR, TA, HR, HA, VR, VA, NA, AR, AA, PR, PA
    prefix = Column(String(1), nullable=False)   # T / H / V / N / A / P
    suffix = Column(String(1), nullable=False)   # R(Raw) / A(Assembly)
    stage_order = Column(SmallInteger, nullable=False, default=0)
    description = Column(Text, nullable=True)
