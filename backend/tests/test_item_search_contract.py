"""The same contract cases exercise both memory and SQL membership."""
import importlib.util
import json
from pathlib import Path

import pytest
from sqlalchemy import literal, select

CONTRACT = json.loads((Path(__file__).parent / "fixtures/item-search-contract.json").read_text(encoding="utf-8"))


def test_search_engine_exists():
    assert importlib.util.find_spec("app.services.item_search") is not None


def test_unicode_whitespace_and_generic_literal_search(db_session):
    from app.utils.search import normalize_search_text, build_normalized_search_filter
    assert normalize_search_text("A\u00a0B\u3000C\ufeffD") == "abcd"
    assert db_session.scalar(select(build_normalized_search_filter("Nut Bolt", literal("Bolt Nut"))))
    assert not db_session.scalar(select(build_normalized_search_filter("A_B", literal("AXB"))))


def test_sql_abbreviation_boundary_uses_same_unicode_lowercase_as_memory(db_session):
    from app.services.item_search import matches_item_search, build_item_search_filter
    groups = [["Board", "K"]]
    assert matches_item_search("Board", name_fields=["\u212a"], groups=groups)
    assert db_session.scalar(select(build_item_search_filter(None, "Board", name_columns=[literal("\u212a")], groups=groups)))


@pytest.mark.parametrize("case", CONTRACT["cases"], ids=lambda case: case["name"])
@pytest.mark.parametrize("engine", ["memory", "sql"])
def test_memory_sql_contract(db_session, case, engine):
    from app.services.item_search import matches_item_search, build_item_search_filter
    groups = case.get("groups", CONTRACT["groups"])
    if engine == "memory":
        assert matches_item_search(case["query"], name_fields=case["name_fields"],
            literal_fields=case["literal_fields"], aliases=case["aliases"], groups=groups) is case["expected"]
        return
    predicate = build_item_search_filter(None, case["query"],
        name_columns=[literal(value) for value in case["name_fields"] + case["aliases"]],
        literal_columns=[literal(value) for value in case["literal_fields"]], groups=groups)
    assert bool(db_session.scalar(select(predicate if predicate is not None else literal(True)))) is case["expected"]
