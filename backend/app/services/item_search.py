"""One search plan preserves literal membership and scopes synonym expansion."""
from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Sequence

from sqlalchemy import ColumnElement, and_, exists, false, or_
from sqlalchemy.orm import Session

from app.utils.search import NormalizedSearchText, SearchBoundaryText, _SEARCH_WHITESPACE, normalize_search_boundary_text, normalize_search_text


def _search_queries(search: str | None) -> list[str]:
    """Ignore empty comma branches so a trailing comma cannot match every item."""
    return [query for query in (search or "").split(",") if normalize_search_text(query)]


def search_clauses(search: str, groups: Sequence[Sequence[str]]) -> list[tuple[str, list[str]]]:
    """Consume the longest registered phrase before considering shorter words."""
    dictionary = {normalize_search_text(term): [normalize_search_text(value) for value in group]
                  for group in groups for term in group}
    split_search = search
    for character in _SEARCH_WHITESPACE:
        split_search = split_search.replace(character, " ")
    words = [word for word in split_search.split(" ") if normalize_search_text(word)]
    clauses = []
    index = 0
    while index < len(words):
        for end in range(len(words), index, -1):
            original = normalize_search_text(" ".join(words[index:end]))
            if original in dictionary:
                clauses.append((original, dictionary[original]))
                index = end
                break
        else:
            original = normalize_search_text(words[index])
            clauses.append((original, [original]))
            index += 1
    return clauses


def _pattern(term: str) -> str:
    """Allow ignored inner whitespace while retaining outer ASCII boundaries."""
    whitespace = f"[{''.join(_SEARCH_WHITESPACE)}]*"
    letters = whitespace.join(re.escape(letter) for letter in term)
    return rf"(^|[^a-z0-9]){letters}([^a-z0-9]|$)"


def matches_item_search(search: str | None, *, name_fields: Sequence[str | None],
                        code_fields: Sequence[str | None] = (),
                        literal_fields: Sequence[str | None] = (), aliases: Sequence[str] = (),
                        groups: Sequence[Sequence[str]] = ()) -> bool:
    """OR comma-separated queries, preserving snapshot and metadata field scopes."""
    if not normalize_search_text(search or ""):
        return True
    queries = _search_queries(search)
    names = [normalize_search_text(value or "") for value in [*name_fields, *aliases]]
    boundary_names = [normalize_search_boundary_text(value or "") for value in [*name_fields, *aliases]]
    codes = [normalize_search_text(value or "") for value in code_fields]
    literals = codes + [normalize_search_text(value or "") for value in literal_fields]
    for query in queries:
        term = normalize_search_text(query)
        if any(term in value for value in [*names, *literals]):
            return True
        for original, alternatives in search_clauses(query, groups):
            if any(original in value for value in [*names, *literals]):
                continue
            if not any(any(alt in value for value in codes) or (any(re.search(_pattern(alt), value) for value in boundary_names)
                       if re.fullmatch(r"[a-z]{1,3}", alt) else any(alt in value for value in names))
                       for alt in alternatives if alt != original):
                break
        else:
            return True
    return False


def _normalized_column(column: ColumnElement[str]) -> ColumnElement[str]:
    """Use portable SQL string functions so SQLite and PostgreSQL agree."""
    return NormalizedSearchText(column)


def _literal_match(column: ColumnElement[str], term: str) -> ColumnElement[bool]:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return _normalized_column(column).like(f"%{escaped}%", escape="\\")


def _boundary_column(column: ColumnElement[str]) -> ColumnElement[str]:
    """Keep word boundaries while removing the abbreviation separators."""
    return SearchBoundaryText(column)


def get_search_config(db: Session) -> dict:
    """Hash stable sorted content; unrelated inventory revisions never affect it."""
    from app.models.item_search import ItemAlias, ItemSynonymGroup, ItemSynonymTerm
    groups = db.query(ItemSynonymGroup).order_by(ItemSynonymGroup.group_id).all()
    terms = db.query(ItemSynonymTerm).order_by(ItemSynonymTerm.normalized_term, ItemSynonymTerm.term).all()
    by_group: dict[str, list[str]] = {}
    for term in terms:
        by_group.setdefault(str(term.group_id), []).append(term.term)
    aliases: dict[str, list[dict]] = {}
    for row in db.query(ItemAlias).order_by(ItemAlias.item_id, ItemAlias.normalized_alias, ItemAlias.alias_id):
        aliases.setdefault(str(row.item_id), []).append({"alias_id": str(row.alias_id), "alias": row.alias})
    content = {"synonym_groups": [{"group_id": str(row.group_id), "version": row.version,
                                  "terms": by_group.get(str(row.group_id), [])} for row in groups],
               "item_aliases": aliases}
    version = hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False,
                                       separators=(",", ":")).encode()).hexdigest()
    return {"version": version, **content}


def load_synonym_groups(db: Session) -> list[list[str]]:
    """SQL alias EXISTS consumers need dictionary terms, not the entire alias map."""
    from app.models.item_search import ItemSynonymTerm
    groups: dict[str, list[str]] = {}
    for row in db.query(ItemSynonymTerm).order_by(ItemSynonymTerm.group_id, ItemSynonymTerm.normalized_term):
        groups.setdefault(str(row.group_id), []).append(row.term)
    return list(groups.values())


def build_item_search_filter(db: Session | None, search: str | None, *,
                             name_columns: Sequence[ColumnElement[str]],
                             code_columns: Sequence[ColumnElement[str]] = (),
                             literal_columns: Sequence[ColumnElement[str]] = (),
                             item_id_column: ColumnElement | None = None,
                             groups: Sequence[Sequence[str]] | None = None) -> ColumnElement[bool] | None:
    """Correlated alias EXISTS prevents duplicated rows before count and paging."""
    if not normalize_search_text(search or ""):
        return None
    queries = _search_queries(search)
    if groups is None:
        groups = load_synonym_groups(db) if db is not None else []

    def membership(original: str, alternatives: Sequence[str] = ()) -> ColumnElement[bool]:
        def name_match(column: ColumnElement[str]) -> ColumnElement[bool]:
            return or_(_literal_match(column, original), *[
                _boundary_column(column).regexp_match(_pattern(alt))
                if re.fullmatch(r"[a-z]{1,3}", alt) else _literal_match(column, alt)
                for alt in alternatives if alt != original])
        conditions = [name_match(column) for column in name_columns]
        conditions.extend(_literal_match(column, term) for column in code_columns
                          for term in {original, *alternatives})
        conditions.extend(_literal_match(column, original) for column in literal_columns)
        if item_id_column is not None:
            from app.models.item_search import ItemAlias
            conditions.append(exists().where(ItemAlias.item_id == item_id_column, name_match(ItemAlias.alias)))
        return or_(*conditions)

    return or_(false(), *(or_(membership(normalize_search_text(query)), and_(*[membership(original, alternatives)
        for original, alternatives in search_clauses(query, groups)])) for query in queries))
