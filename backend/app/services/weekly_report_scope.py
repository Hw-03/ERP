"""주간보고에 포함할 품목과 표시 공정을 한 곳에서 판정한다."""

from __future__ import annotations

from datetime import date
from typing import Optional

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from app.models import Item


FINISHED_PROCESS_CODES: tuple[str, ...] = ("TF", "HF", "VF", "NF", "AF", "PF")
VACUUM_GENERATOR_PROCESS_CODE = "VA"
VACUUM_GENERATOR_GROUP_CODE = "VF"
VACUUM_GENERATOR_NAME_PREFIX = "발생부"
VACUUM_GENERATOR_NAME_TOKEN = "(진공)"
VACUUM_GENERATOR_WEEKLY_START = date(2026, 9, 7)
CERAMIC_TUBE_HOUSING_MES_CODE = "3468-HA-0006"
CERAMIC_TUBE_HOUSING_PROCESS_CODE = "HA"
CERAMIC_TUBE_HOUSING_GROUP_CODE = "HF"
CERAMIC_TUBE_HOUSING_WEEKLY_START = date(2026, 9, 7)


def includes_vacuum_generator_for_week(week_start: date) -> bool:
    """발생부 진공 예외가 적용되는 첫 보고 주차 이후인지 반환한다."""
    return week_start >= VACUUM_GENERATOR_WEEKLY_START


def includes_ceramic_tube_housing_for_week(week_start: date) -> bool:
    """세라믹튜브 하우징 HA 예외가 적용되는 첫 보고 주차 이후인지 반환한다."""
    return week_start >= CERAMIC_TUBE_HOUSING_WEEKLY_START


def weekly_report_item_sort_key(
    process_type_code: Optional[str],
    mes_code: Optional[str],
    item_name: str,
) -> tuple[int, str, str]:
    """포함된 중간 A 공정을 기존 완료품보다 먼저 정렬하는 키를 반환한다."""
    process_order = 0 if (process_type_code or "").endswith("A") else 1
    return process_order, mes_code or "", item_name


def is_vacuum_generator_weekly_item(
    process_type_code: Optional[str],
    item_name: str,
) -> bool:
    """발생부 진공 VA 품목만 완료품 주간보고 예외로 인정한다."""
    return (
        process_type_code == VACUUM_GENERATOR_PROCESS_CODE
        and item_name.startswith(VACUUM_GENERATOR_NAME_PREFIX)
        and VACUUM_GENERATOR_NAME_TOKEN in item_name
    )


def is_ceramic_tube_housing_weekly_item(
    process_type_code: Optional[str],
    mes_code: Optional[str],
) -> bool:
    """고압 상세에 포함할 세라믹튜브 70KV 하우징 한 품목만 판정한다."""
    return (
        process_type_code == CERAMIC_TUBE_HOUSING_PROCESS_CODE
        and mes_code == CERAMIC_TUBE_HOUSING_MES_CODE
    )


def is_weekly_report_item(
    process_type_code: Optional[str],
    item_name: str,
    mes_code: Optional[str] = None,
    *,
    include_vacuum_generator: bool = True,
    include_ceramic_tube_housing: bool = True,
) -> bool:
    """완료품 6개 공정 또는 승인된 중간공정 예외인지 순수하게 판정한다."""
    return (
        process_type_code in FINISHED_PROCESS_CODES
        or (
            include_vacuum_generator
            and is_vacuum_generator_weekly_item(process_type_code, item_name)
        )
        or (
            include_ceramic_tube_housing
            and is_ceramic_tube_housing_weekly_item(process_type_code, mes_code)
        )
    )


def weekly_report_group_code(
    process_type_code: Optional[str],
    item_name: str,
    mes_code: Optional[str] = None,
    *,
    include_vacuum_generator: bool = True,
    include_ceramic_tube_housing: bool = True,
) -> Optional[str]:
    """주간보고 표에서 사용할 기존 6개 공정 그룹 코드를 반환한다."""
    if include_vacuum_generator and is_vacuum_generator_weekly_item(process_type_code, item_name):
        return VACUUM_GENERATOR_GROUP_CODE
    if (
        include_ceramic_tube_housing
        and is_ceramic_tube_housing_weekly_item(process_type_code, mes_code)
    ):
        return CERAMIC_TUBE_HOUSING_GROUP_CODE
    return process_type_code


def weekly_report_item_clause(
    item: type[Item],
    *,
    include_vacuum_generator: bool = True,
    include_ceramic_tube_housing: bool = True,
) -> ColumnElement[bool]:
    """완료품 또는 승인된 중간공정 예외를 고르는 SQLAlchemy 조건을 만든다."""
    clauses: list[ColumnElement[bool]] = [item.process_type_code.in_(FINISHED_PROCESS_CODES)]
    if include_vacuum_generator:
        clauses.append(
            and_(
                item.process_type_code == VACUUM_GENERATOR_PROCESS_CODE,
                item.item_name.startswith(VACUUM_GENERATOR_NAME_PREFIX),
                item.item_name.contains(VACUUM_GENERATOR_NAME_TOKEN),
            )
        )
    if include_ceramic_tube_housing:
        clauses.append(
            and_(
                item.process_type_code == CERAMIC_TUBE_HOUSING_PROCESS_CODE,
                item.mes_code == CERAMIC_TUBE_HOUSING_MES_CODE,
            )
        )
    return or_(*clauses)
