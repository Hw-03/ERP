"""품목·BOM 도메인.

품목-모델 매핑은 별도 테이블 없이 mes_code prefix (첫 '-' 앞 글자열) 에서
유도한다 — 회사 규약상 각 글자가 ProductSymbol.symbol 과 1:1 대응이라
이중 출처를 둘 이유가 없음. 헬퍼: app.utils.mes_code.mes_code_to_model_slots.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    Column,
    Computed,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "Item",
    "BOM",
]


class Item(Base):
    __tablename__ = "items"
    __table_args__ = (
        CheckConstraint("min_stock >= 0 OR min_stock IS NULL", name="ck_items_min_stock_nonneg"),
    )

    item_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    item_name = Column(String(200), nullable=False)
    sort_order = Column(Integer, nullable=True, index=True)  # 엑셀 정리본 행 순서
    unit = Column(String(20), nullable=False, default="EA")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    # Legacy UI display fields (populated from ERP_Master_DB.csv or rule-based defaults)

    legacy_part = Column(String(50), nullable=True, index=True)       # 자재창고/조립출하/고압파트/진공파트/튜닝파트/출하
    legacy_item_type = Column(String(50), nullable=True)              # part_type from CSV
    supplier = Column(String(200), nullable=True)
    min_stock = Column(IntQuantity, nullable=True)

    # 3-part item code ([모델기호조합]-[구분코드]-[일련번호])
    # mes_code 는 분해필드 3종에서 DB 가 계산하는 STORED 생성열 — 진실소스는 분해필드, 직접 쓰기 불가.
    # printf 는 SQLite 전용. PG 활성화 시 표현식을 to_char(serial_no,'FM0000') 로 분기.
    mes_code = Column(
        String(40),
        Computed(
            "model_symbol || '-' || process_type_code || '-' || printf('%04d', serial_no)",
            persisted=True,  # STORED
        ),
        # 전역 unique — 소프트삭제 행도 코드 영구 점유(이력 추적성). 같은 코드 재등록 차단.
        # next_serial_no 가 삭제 포함 전체 max+1 이라 정상 신규 등록은 영향 없음.
        unique=True,
        index=True,
    )
    model_symbol = Column(String(20), nullable=True, index=True)  # 예: "346", "3", "34678"
    process_type_code = Column(String(2), ForeignKey("process_types.code"), nullable=True, index=True)
    serial_no = Column(Integer, nullable=True)

    # BOM 완료 워크플로우 — 사용자가 명시적으로 "완료로 표시"를 누를 때만 set/clear
    bom_completed_at = Column(DateTime, nullable=True)

    # 소프트 삭제 — NULL 이면 활성, 값 있으면 삭제됨
    deleted_at = Column(DateTime, nullable=True)

    inventory = relationship("Inventory", back_populates="item", uselist=False, cascade="all, delete-orphan")
    bom_as_parent = relationship(
        "BOM",
        foreign_keys="BOM.parent_item_id",
        back_populates="parent_item",
        cascade="all, delete-orphan",
    )
    bom_as_child = relationship("BOM", foreign_keys="BOM.child_item_id", back_populates="child_item")
    transaction_logs = relationship(
        "TransactionLog",
        back_populates="item",
        cascade="all, delete-orphan",
    )


class BOM(Base):
    __tablename__ = "bom"

    bom_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    parent_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    child_item_id = Column(UUIDString, ForeignKey("items.item_id", ondelete="CASCADE"), nullable=False, index=True)
    quantity = Column(IntQuantity, nullable=False)
    unit = Column(String(20), nullable=False, default="EA")
    notes = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint("parent_item_id", "child_item_id", name="uq_bom_parent_child"),
        Index("ix_bom_parent", "parent_item_id"),
        Index("ix_bom_child", "child_item_id"),
    )

    parent_item = relationship("Item", foreign_keys=[parent_item_id], back_populates="bom_as_parent")
    child_item = relationship("Item", foreign_keys=[child_item_id], back_populates="bom_as_child")
