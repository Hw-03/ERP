"""직원별 품목 표시 순서 커스터마이징 모델."""

from sqlalchemy import Column, ForeignKey, Index, Integer

from app.models.base import Base, UUIDString

__all__ = ["EmployeeItemOrder"]


class EmployeeItemOrder(Base):
    __tablename__ = "employee_item_orders"

    employee_id = Column(
        UUIDString,
        ForeignKey("employees.employee_id", ondelete="CASCADE"),
        primary_key=True,
    )
    item_id = Column(
        UUIDString,
        ForeignKey("items.item_id", ondelete="CASCADE"),
        primary_key=True,
    )
    display_order = Column(Integer, nullable=False)

    __table_args__ = (
        Index("ix_employee_item_orders_employee", "employee_id"),
    )
