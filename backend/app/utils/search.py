"""사용자 텍스트 검색 정규화 유틸리티."""

from sqlalchemy import ColumnElement, String, and_, event, or_
from sqlalchemy.engine import Engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.sql.functions import FunctionElement


_SEARCH_WHITESPACE = (" ", "\t", "\r", "\n", "\f", "\v", "\u00a0", "\u1680",
    *tuple(chr(code) for code in range(0x2000, 0x200B)), "\u2028", "\u2029", "\u202f",
    "\u205f", "\u3000", "\ufeff")
_REMOVED_SEARCH_CHARACTERS = (*_SEARCH_WHITESPACE, "-", ".", "/")


def normalize_search_text(value: str) -> str:
    """검색어 비교 전에 공백류와 구분 문자를 제거한다."""
    normalized = value.lower()
    for character in _REMOVED_SEARCH_CHARACTERS:
        normalized = normalized.replace(character, "")
    return normalized


def normalize_search_boundary_text(value: str) -> str:
    """Remove separators while retaining the word boundaries of abbreviations."""
    return value.lower().replace("-", "").replace(".", "").replace("/", "")


class NormalizedSearchText(FunctionElement):
    """Avoid SQLite parser depth limits with one deterministic scalar function."""
    type = String()
    inherit_cache = True


class SearchBoundaryText(FunctionElement):
    """Use full Unicode lowercase without discarding word boundaries."""
    type = String()
    inherit_cache = True


@compiles(SearchBoundaryText, "sqlite")
def _sqlite_boundary(element: SearchBoundaryText, compiler: object, **kwargs: object) -> str:
    return f"mes_boundary_search({compiler.process(list(element.clauses)[0], **kwargs)})"


@compiles(SearchBoundaryText)
def _portable_boundary(element: SearchBoundaryText, compiler: object, **kwargs: object) -> str:
    column = compiler.process(list(element.clauses)[0], **kwargs)
    return f"translate(lower(coalesce({column}, '')), '-./', '')"


@compiles(NormalizedSearchText, "sqlite")
def _sqlite_normalized(element: NormalizedSearchText, compiler: object, **kwargs: object) -> str:
    return f"mes_normalize_search({compiler.process(list(element.clauses)[0], **kwargs)})"


@compiles(NormalizedSearchText)
def _portable_normalized(element: NormalizedSearchText, compiler: object, **kwargs: object) -> str:
    column = compiler.process(list(element.clauses)[0], **kwargs)
    removed = compiler.render_literal_value("".join(_REMOVED_SEARCH_CHARACTERS), String())
    return f"translate(lower(coalesce({column}, '')), {removed}, '')"


@event.listens_for(Engine, "connect")
def _install_sqlite_normalizer(connection: object, _record: object) -> None:
    """Keep the SQLite function identical to Python, including Unicode casing."""
    if hasattr(connection, "create_function"):
        connection.create_function("mes_normalize_search", 1,
            lambda value: normalize_search_text(value or ""), deterministic=True)
        connection.create_function("mes_boundary_search", 1,
            lambda value: normalize_search_boundary_text(value or ""), deterministic=True)


def build_normalized_search_filter(
    search: str | None,
    *columns: ColumnElement[str],
) -> ColumnElement[bool] | None:
    """기존 대상 컬럼에 대한 NULL 안전 정규화 부분 검색 조건을 만든다."""
    term = normalize_search_text(search or "")
    if not term or not columns:
        return None

    normalized_columns = []
    for column in columns:
        normalized_columns.append(NormalizedSearchText(column))

    def membership(value: str) -> ColumnElement[bool]:
        escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return or_(*(column.like(f"%{escaped}%", escape="\\") for column in normalized_columns))

    words = search or ""
    for character in _SEARCH_WHITESPACE:
        words = words.replace(character, " ")
    clauses = [normalize_search_text(word) for word in words.split(" ") if normalize_search_text(word)]
    return or_(membership(term), and_(*(membership(clause) for clause in clauses)))
