"""사용자 텍스트 검색 정규화 유틸리티."""

from sqlalchemy import ColumnElement, func, or_


_REMOVED_SEARCH_CHARACTERS = (" ", "\t", "\r", "\n", "\f", "\v", "-", ".", "/")


def normalize_search_text(value: str) -> str:
    """검색어 비교 전에 공백류와 구분 문자를 제거한다."""
    normalized = value.lower()
    for character in _REMOVED_SEARCH_CHARACTERS:
        normalized = normalized.replace(character, "")
    return normalized


def build_normalized_search_filter(
    search: str | None,
    *columns: ColumnElement[str],
) -> ColumnElement[bool] | None:
    """기존 대상 컬럼에 대한 NULL 안전 정규화 부분 검색 조건을 만든다."""
    term = normalize_search_text(search or "")
    if not term or not columns:
        return None

    filters = []
    for column in columns:
        normalized_column = func.coalesce(column, "")
        for character in _REMOVED_SEARCH_CHARACTERS:
            normalized_column = func.replace(normalized_column, character, "")
        filters.append(normalized_column.ilike(f"%{term}%"))
    return or_(*filters)
