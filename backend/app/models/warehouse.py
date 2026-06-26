"""창고 지도 — 물리적 보관 구조(앵글) + 박스 배치.

구조(structure)와 배치(placement)를 분리한다:
- WarehouseAngle  : 평면도 한 블록(랙). 관리 화면에서 CRUD (구조 편집).
- WarehouseBox    : 자리(좌표)에 놓인 박스 1개. 자리는 별도 테이블 없이
                    (angle_id, row_no, layer_no, jari_index) 좌표로만 식별한다.
- WarehouseBoxItem: 박스 안에 담긴 품목+수량 (실제 Item 마스터 FK).

부서색은 품목의 process_type_code prefix(T/H/V/N/A/P) → 부서 → Department.color_hex
로 유도하므로 본 모델엔 색 컬럼을 두지 않는다(이중 출처 방지).
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy.orm import relationship

from app.models.base import Base, IntQuantity, UUIDString

__all__ = [
    "BoxSizeEnum",
    "WarehouseAngle",
    "WarehouseBox",
    "WarehouseBoxItem",
]


class BoxSizeEnum(str, enum.Enum):
    """박스 크기 — 자리(높이 3유닛) 안에서 차지하는 높이. 대=3 / 중=2 / 소=1."""
    LARGE = "LARGE"    # 대
    MEDIUM = "MEDIUM"  # 중
    SMALL = "SMALL"    # 소


class WarehouseAngle(Base):
    """앵글(랙) — 평면도 한 블록. 880×300 좌표계 안의 x/y/w/h 로 배치된다."""
    __tablename__ = "warehouse_angles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(String(50), nullable=False)
    angle_type = Column(String(20), nullable=False, default="angle", server_default="angle")
    rows = Column(Integer, nullable=False, default=1)            # 줄 수(가로 칸)
    layers = Column(Integer, nullable=False, default=1)          # 층 수(세로 칸)
    jaris_per_cell = Column(Integer, nullable=False, default=3)  # 칸당 자리 수(현 UI 고정 3)
    # 평면도 좌표·크기 (프로토타입 POSITIONS {x,y,w,h})
    pos_x = Column(Integer, nullable=False, default=0)
    pos_y = Column(Integer, nullable=False, default=0)
    width = Column(Integer, nullable=False, default=72)
    height = Column(Integer, nullable=False, default=60)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    boxes = relationship(
        "WarehouseBox", back_populates="angle", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("angle_type IN ('angle', 'aisle', 'pallet')", name="ck_wh_angle_type"),
        CheckConstraint("rows >= 1 AND layers >= 1", name="ck_wh_angle_dims_pos"),
        CheckConstraint("jaris_per_cell >= 1", name="ck_wh_angle_jaris_pos"),
    )


class WarehouseBox(Base):
    """자리(좌표)에 놓인 박스 1개. 자리 = (angle_id, row_no, layer_no, jari_index).

    빈 자리는 행을 만들지 않는다 — 박스가 놓이는 순간에만 좌표로 표현된다."""
    __tablename__ = "warehouse_boxes"

    box_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    angle_id = Column(
        Integer,
        ForeignKey("warehouse_angles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_no = Column(Integer, nullable=False)      # 1-based 줄
    layer_no = Column(Integer, nullable=False)    # 1-based 층
    jari_index = Column(Integer, nullable=False)  # 0-based 자리 (0/1/2)
    size = Column(
        SAEnum(BoxSizeEnum, name="box_size_enum", create_type=True),
        nullable=False,
    )
    stack_order = Column(Integer, nullable=False, default=0)  # 자리 내 쌓임 순서(아래=0)
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    angle = relationship("WarehouseAngle", back_populates="boxes")
    contents = relationship(
        "WarehouseBoxItem", back_populates="box", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_wh_box_coord", "angle_id", "row_no", "layer_no", "jari_index"),
        CheckConstraint("jari_index >= 0", name="ck_wh_box_jari_nonneg"),
        CheckConstraint("row_no >= 1 AND layer_no >= 1", name="ck_wh_box_coord_pos"),
    )


class WarehouseBoxItem(Base):
    """박스 안에 담긴 품목+수량. 품목은 실제 Item 마스터 FK."""
    __tablename__ = "warehouse_box_items"

    id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    box_id = Column(
        UUIDString,
        ForeignKey("warehouse_boxes.box_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUIDString,
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(IntQuantity, nullable=False, default=0)

    box = relationship("WarehouseBox", back_populates="contents")
    item = relationship("Item")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_wh_boxitem_qty_nonneg"),
        Index("ix_wh_boxitem_item", "item_id"),  # 검색·재고대조 핵심
    )

class WarehouseSpecialZone(Base):
    """Free-form warehouse map zone for aisle and pallet storage."""
    __tablename__ = "warehouse_special_zones"

    id = Column(Integer, primary_key=True, autoincrement=True)
    label = Column(String(50), nullable=False)
    zone_type = Column(String(20), nullable=False)
    pos_x = Column(Integer, nullable=False, default=0)
    pos_y = Column(Integer, nullable=False, default=0)
    width = Column(Integer, nullable=False, default=80)
    height = Column(Integer, nullable=False, default=40)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )

    contents = relationship(
        "WarehouseSpecialZoneItem", back_populates="zone", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("zone_type IN ('aisle', 'pallet')", name="ck_wh_zone_type"),
        CheckConstraint("width >= 1 AND height >= 1", name="ck_wh_zone_size_pos"),
        Index("ix_wh_zone_order", "display_order", "id"),
    )


class WarehouseSpecialZoneItem(Base):
    """Item quantities placed in an aisle or pallet zone."""
    __tablename__ = "warehouse_special_zone_items"

    id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    zone_id = Column(
        Integer,
        ForeignKey("warehouse_special_zones.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        UUIDString,
        ForeignKey("items.item_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity = Column(IntQuantity, nullable=False, default=0)

    zone = relationship("WarehouseSpecialZone", back_populates="contents")
    item = relationship("Item")

    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_wh_zoneitem_qty_nonneg"),
        Index("ix_wh_zoneitem_item", "item_id"),
    )


class WarehouseSpecialZoneAudit(Base):
    """Minimal audit trail for warehouse special zone edits."""
    __tablename__ = "warehouse_special_zone_audits"

    id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    zone_id = Column(
        Integer,
        ForeignKey("warehouse_special_zones.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    action = Column(String(32), nullable=False)
    actor_employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_employee_code = Column(String(30), nullable=True)
    actor_name = Column(String(100), nullable=True)
    created_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, server_default=func.now()
    )
