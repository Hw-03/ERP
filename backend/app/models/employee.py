"""직원·부서 도메인."""

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
    SmallInteger,
    String,
    Text,
    func,
)
from app.models.base import Base, BoolAsString, UUIDString

__all__ = [
    "EmployeeLevelEnum",
    "Department",
    "Employee",
    "EmployeeAssignedModel",
]


class EmployeeLevelEnum(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    STAFF = "staff"


class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    color_hex = Column(String(7), nullable=True)
    io_enabled = Column(Boolean, nullable=False, default=True)


class Employee(Base):
    __tablename__ = "employees"

    employee_id = Column(UUIDString, primary_key=True, default=uuid.uuid4)
    employee_code = Column(String(30), unique=True, nullable=False, index=True)
    name = Column(String(100), nullable=False, index=True)
    role = Column(String(100), nullable=False)
    phone = Column(String(30), nullable=True)
    department = Column(String(50), nullable=False, default="기타", index=True)
    level = Column(
        SAEnum(EmployeeLevelEnum, name="employee_level_enum", create_type=True),
        nullable=False,
        default=EmployeeLevelEnum.STAFF,
    )
    # 창고 결재 역할: "none" | "primary" | "deputy". 시스템 권한(level)과 별개의 업무 역할.
    # 소문자 문자열로 통일 (DB / API / 프론트 모두 동일).
    warehouse_role = Column(String(20), nullable=False, default="none", server_default="none")
    # 부서 결재 역할: 낱개(manual/adjust_in/adjust_out) IO 작업 승인 권한. warehouse_role 와 별개.
    department_role = Column(String(20), nullable=False, default="none", server_default="none")
    # 2026-05-24 (W12-#7): 직원별 입출고 권한 토글. 부서 io_enabled 와 AND 결합.
    # 기본값 True — 신규 직원은 부서 권한만 만족하면 입출고 가능.
    io_enabled = Column(Boolean, nullable=False, default=True, server_default="true")
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(BoolAsString, nullable=False, default=True)
    # 작업자 식별용 PIN 해시 — 실제 보안 인증이 아님. None이면 기본 PIN 0000 적용
    pin_hash = Column(Text, nullable=True)
    pin_last_changed = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow, server_default=func.now())
    updated_at = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        server_default=func.now(),
    )
    theme = Column(String(10), nullable=True)

    __table_args__ = (
        CheckConstraint(
            "warehouse_role IN ('none', 'primary', 'deputy')",
            name="ck_employee_warehouse_role",
        ),
        CheckConstraint(
            "department_role IN ('none', 'primary', 'deputy')",
            name="ck_employee_department_role",
        ),
    )


class EmployeeAssignedModel(Base):
    """직원-제품 다대다. 조립 부서 직원에게 담당 모델을 지정하면
    입출고 목록에서 조립 그룹 내부 정렬 시 담당 모델 부품이 위로 올라간다.
    priority 가 작을수록 더 위 — 0 이 1순위.
    """

    __tablename__ = "employee_assigned_models"

    employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        primary_key=True,
    )
    slot = Column(
        SmallInteger,
        ForeignKey("product_symbols.slot", ondelete="CASCADE"),
        primary_key=True,
    )
    priority = Column(Integer, nullable=False, default=0, server_default="0")

    __table_args__ = (
        Index("ix_eam_employee", "employee_id"),
        Index("ix_eam_employee_priority", "employee_id", "priority"),
    )
