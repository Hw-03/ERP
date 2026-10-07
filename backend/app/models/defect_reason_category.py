"""불량 사유의 현재 선택지와 과거 문자열 연결을 관리한다."""

from __future__ import annotations

import unicodedata
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Text, UniqueConstraint, func

from app.models.base import Base, UUIDString


DEFAULT_DEFECT_REASON_CATEGORIES = (
    "외관 불량", "치수 불량", "기능 불량", "검사 통과", "누유", "이물질", "고압",
    "10A", "선광불량", "mA 불량", "KV 불량", "파형 불량", "기타",
)
DEFECT_REASON_CATEGORY_NAMESPACE = uuid.UUID("09d4f985-54b0-5d11-b9d9-30bf2606baaf")


def normalize_defect_reason_name(name: str) -> str:
    """표기 차이는 하나의 사유로 연결하되 저장된 표시 이름은 변경하지 않는다."""
    return unicodedata.normalize("NFKC", name).strip().casefold()


def defect_reason_category_id(name: str) -> uuid.UUID:
    """bootstrap과 migration이 같은 기본 사유 식별자를 생성하게 한다."""
    return uuid.uuid5(DEFECT_REASON_CATEGORY_NAMESPACE, normalize_defect_reason_name(name))


class DefectReasonCategory(Base):
    """비활성 선택지도 이력 연결을 위해 보존한다."""

    __tablename__ = "defect_reason_categories"

    category_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    normalized_name = Column(Text, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True, server_default="1", index=True)
    is_other = Column(Boolean, nullable=False, default=False, server_default="0")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("normalized_name", name="uq_defect_reason_categories_normalized_name"),
    )
