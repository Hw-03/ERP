"""불량 발생 통계 서비스의 입력·응답 계약."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


DefectStatisticsPeriodKind = Literal["week", "month", "year"]


class DefectStatisticsPeriod(BaseModel):
    """KST 달력 기준으로 확정된 포함 시작일과 종료일."""

    kind: DefectStatisticsPeriodKind
    anchor: date
    start_date: date
    end_date: date


class DefectStatisticsFilters(BaseModel):
    """라우터가 단일·복수 쿼리 값을 정규화해 전달하는 다중 선택 필터."""

    departments: tuple[str, ...] = Field(default_factory=tuple)
    models: tuple[str, ...] = Field(default_factory=tuple)
    process_steps: tuple[str, ...] = Field(default_factory=tuple)
    reason: str | None = None
    reason_category_id: uuid.UUID | None = None
    item_id: uuid.UUID | None = None


class DefectStatisticsBreakdownEntry(BaseModel):
    """하나의 분류값에 모인 발생 건수와 수량."""

    key: str
    label: str
    record_count: int
    quantity: int


class DefectStatisticsItemBreakdownEntry(DefectStatisticsBreakdownEntry):
    """품목별 분류값과 화면 표시에 필요한 품목 식별자."""

    item_id: uuid.UUID
    mes_code: str | None = None


class DefectStatisticsTimelineEntry(BaseModel):
    """빈 구간도 포함하는 일별 또는 월별 발생 버킷."""

    bucket: str
    label: str
    record_count: int
    quantity: int


class DefectStatisticsSummary(BaseModel):
    """선택 기간·필터 전체의 핵심 발생 지표."""

    record_count: int
    quantity: int
    top_item: DefectStatisticsItemBreakdownEntry | None = None
    top_reason: DefectStatisticsBreakdownEntry | None = None


class DefectStatisticsResponse(BaseModel):
    """불량 통계 API가 그대로 반환할 수 있는 서비스 응답."""

    period: DefectStatisticsPeriod
    summary: DefectStatisticsSummary
    timeline: list[DefectStatisticsTimelineEntry]
    items: list[DefectStatisticsItemBreakdownEntry]
    reasons: list[DefectStatisticsBreakdownEntry]
    departments: list[DefectStatisticsBreakdownEntry]
    categories: list[DefectStatisticsBreakdownEntry]
    excluded_legacy_count: int
    excluded_category_count: int


class DefectStatisticsComparison(BaseModel):
    """직전 달력 기간의 동일 관측 범위와 선택 기간의 차이."""

    period: DefectStatisticsPeriod
    observed_until: datetime
    is_partial: bool
    range_adjusted: bool
    summary: DefectStatisticsSummary
    items: list[DefectStatisticsItemBreakdownEntry]
    reasons: list[DefectStatisticsBreakdownEntry]
    departments: list[DefectStatisticsBreakdownEntry]
    categories: list[DefectStatisticsBreakdownEntry]
    excluded_legacy_count: int
    excluded_category_count: int
    quantity_delta: int
    quantity_change_pct: float | None
    record_count_delta: int
    record_count_change_pct: float | None


class DefectStatisticsTrendEntry(DefectStatisticsTimelineEntry):
    """선택 기간을 끝으로 이어지는 한 달력 기간의 합계."""

    start_date: date
    end_date: date
    is_partial: bool


class DefectStatisticsReportResponse(DefectStatisticsResponse):
    """기존 통계와 관측 시각·직전 기간·추세를 함께 반환한다."""

    as_of: datetime
    observed_until: datetime | None
    is_partial: bool
    comparison: DefectStatisticsComparison | None
    trend: list[DefectStatisticsTrendEntry]
