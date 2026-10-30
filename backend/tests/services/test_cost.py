"""표준 원가는 경로별 수량과 단계별 인건비만 합산한다."""

from datetime import datetime
from decimal import Decimal, getcontext, localcontext
from uuid import uuid4

import pytest
from sqlalchemy import event


D = Decimal


def test_saved_yield_rolls_up_once_per_stage(cost_item, make_bom, db_session):
    raw = cost_item(stage="R", price="100")
    tube = cost_item(stage="F", minutes="0")
    tube.standard_yield_percent = D("80")
    generator = cost_item(stage="F", minutes="1")
    generator.process_type_code = "NF"
    generator.standard_yield_percent = D("90")
    root = cost_item(minutes="0.5")
    make_bom(tube.item_id, raw.item_id, 1)
    make_bom(generator.item_id, tube.item_id, 1)
    make_bom(root.item_id, generator.item_id, 1)
    result = calculate(db_session, root)
    assert result["unit_cost"] == "250.00"
    assert result["yield_adjusted_unit_cost"] == "300.00"
    assert result["yield_cost_difference"] == "50.00"
    assert [(r["input_unit_cost"], r["output_unit_cost"]) for r in result["yield_stages"]] == [("100.00", "125.00"), ("225.00", "250.00")]


def test_excel_tube_yield_and_unregistered_basis(cost_item, make_bom, db_session):
    raw = cost_item(stage="R", price="169484")
    tube = cost_item(stage="F", minutes="0")
    make_bom(tube.item_id, raw.item_id, 1)
    result = calculate(db_session, tube)
    assert result["yield_adjusted_unit_cost"] == result["unit_cost"]
    assert result["yield_stages"][0]["standard_yield_percent"] is None
    tube.standard_yield_percent = D("70")
    assert calculate(db_session, tube)["yield_adjusted_unit_cost"] == "242120.00"


def test_excel_generator_only_adjustment_leaves_later_cost_unchanged(cost_item, make_bom, db_session):
    purchased = cost_item(stage="R", price="344765")
    generator = cost_item(stage="F", minutes="0")
    generator.process_type_code = "NF"
    generator.standard_yield_percent = D("90")
    later = cost_item(stage="R", price="413103")
    root = cost_item(minutes="0")
    make_bom(generator.item_id, purchased.item_id, 1)
    make_bom(root.item_id, generator.item_id, 1)
    make_bom(root.item_id, later.item_id, 1)
    result = calculate(db_session, root)
    assert result["unit_cost"] == "757868.00"
    assert result["yield_adjusted_unit_cost"] == "796175.22"
    assert [s["process_type_code"] for s in result["yield_stages"]] == ["NF"]


@pytest.mark.parametrize("price,status,expected", [(None, "partial", "0.00"), ("0", "complete", "0.00"), ("1.00", "complete", "3.00")])
def test_yield_rounds_per_item_before_repeated_parent_quantity(cost_item, make_bom, db_session, price, status, expected):
    raw = cost_item(stage="R", price=price)
    tube = cost_item(stage="F", minutes="0")
    tube.standard_yield_percent = D("66.67")
    make_bom(tube.item_id, raw.item_id, 1)
    branch = cost_item(minutes="0")
    make_bom(branch.item_id, tube.item_id, 2)
    root = cost_item(minutes="0")
    make_bom(root.item_id, branch.item_id, 1)
    make_bom(root.item_id, tube.item_id, 2)
    result = calculate(db_session, root)
    assert result["status"] == status
    assert result["yield_adjusted_unit_cost"] == str(D(expected) * 2)
    assert len(result["yield_stages"]) == 2
    assert len({tuple(s["path"]) for s in result["yield_stages"]}) == 2
    tube.standard_yield_percent = D("100")
    result = calculate(db_session, root)
    assert result["yield_adjusted_unit_cost"] == result["unit_cost"]
    assert result["yield_cost_difference"] == "0.00"


def test_unavailable_and_large_yield_difference_keep_decimal_precision(cost_item, make_bom, db_session):
    tube = cost_item(stage="F")
    tube.standard_yield_percent = D("0.01")
    assert calculate(db_session, tube)["yield_adjusted_unit_cost"] is None
    raw = cost_item(stage="R", price="9999999999999999.99")
    tube.standard_work_minutes = D("0")
    make_bom(tube.item_id, raw.item_id, 1)
    root = cost_item(minutes="0")
    make_bom(root.item_id, tube.item_id, 999999999)
    result = calculate(db_session, root)
    with localcontext() as ctx:
        ctx.prec = 80
        before = D("9999999999999999.99") * 999999999
        assert D(result["yield_adjusted_unit_cost"]) == before * 10000
        assert D(result["yield_cost_difference"]) == before * 9999


@pytest.fixture
def cost_item(make_item, db_session):
    def create(*, name="품목", stage="A", price=None, minutes=None, complete=True):
        item = make_item(name=name, process_type_code=f"T{stage}")
        item.standard_purchase_price = None if price is None else D(price)
        item.standard_work_minutes = None if minutes is None else D(minutes)
        item.bom_completed_at = datetime(2026, 1, 1) if complete else None
        db_session.flush()
        return item

    return create


def calculate(db_session, item, hourly_rate="6000"):
    from app.services.cost import get_item_cost

    return get_item_cost(
        db_session, item.item_id, None if hourly_rate is None else D(hourly_rate)
    )


def codes(result):
    return {issue["code"] for issue in result["issues"]}


def test_summary_page_loads_graph_once_and_skips_deleted_roots(cost_item, make_bom, db_session):
    from app.services.cost import get_item_cost_summaries

    raw = cost_item(stage="R", price="10")
    parents = [cost_item(minutes="1") for _ in range(10)]
    for parent in parents:
        make_bom(parent.item_id, raw.item_id, D(2))
    deleted = cost_item(stage="R", price="1")
    deleted.deleted_at = datetime(2026, 1, 1)
    db_session.flush()
    ids = [parent.item_id for parent in parents] + [deleted.item_id, uuid4()]
    reads = []
    def record(conn, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            reads.append(statement)
    event.listen(db_session.bind, "before_cursor_execute", record)
    try:
        summaries = get_item_cost_summaries(db_session, ids, D("6000"))
    finally:
        event.remove(db_session.bind, "before_cursor_execute", record)
    assert len(reads) == 2  # One BOM read and one item batch, independent of root count.
    assert len(summaries) == 10
    assert all(row["unit_cost"] == "120.00" and row["own_labor_cost"] == "100.00" for row in summaries)


def test_shared_raw_paths_preserve_quantity_and_step_labor(cost_item, make_bom, db_session):
    raw = cost_item(name="R", stage="R", price="10")
    b = cost_item(name="B", minutes="2", price="9999")
    c = cost_item(name="C", minutes="1", price="9999")
    root = cost_item(name="root", minutes="3", price="9999")
    make_bom(b.item_id, raw.item_id, D(4))
    make_bom(c.item_id, raw.item_id, D(1))
    make_bom(root.item_id, b.item_id, D(2))
    make_bom(root.item_id, c.item_id, D(3))

    result = calculate(db_session, root)

    assert result["material_cost"] == "110.00"
    assert result["labor_cost"] == "1000.00"
    assert result["unit_cost"] == "1110.00"
    assert result["status"] == "complete"
    paths = result["tree"]["children"]
    assert sorted(child["children"][0]["required_quantity"] for child in paths) == [3, 8]
    assert result["tree"]["amount"] == "1110.00"
    assert sorted(child["children"][0]["amount"] for child in paths) == ["30.00", "80.00"]


@pytest.mark.parametrize("price,expected,status", [(None, None, "unavailable"), ("0", "0.00", "complete")])
def test_raw_missing_price_differs_from_explicit_zero(cost_item, db_session, price, expected, status):
    raw = cost_item(stage="R", price=price)
    result = calculate(db_session, raw, hourly_rate=None)
    assert result["unit_cost"] == expected
    assert result["status"] == status
    assert ("missing_price" in codes(result)) is (price is None)
    assert "missing_work_minutes" not in codes(result)


@pytest.mark.parametrize("minutes,rate,expected,issue", [(None, "6000", None, "missing_work_minutes"), ("2", None, None, "missing_hourly_rate"), ("0", None, "0.00", None)])
def test_labor_missing_inputs_and_explicit_zero(cost_item, make_bom, db_session, minutes, rate, expected, issue):
    root = cost_item(minutes=minutes)
    raw = cost_item(stage="R", price="5")
    make_bom(root.item_id, raw.item_id, D(1))
    result = calculate(db_session, root, hourly_rate=rate)
    assert result["tree"]["own_labor_cost"] == expected
    assert result["unit_cost"] == "5.00"
    assert result["status"] == ("partial" if issue else "complete")
    if issue:
        assert issue in codes(result)


def test_round_labor_once_per_stage_unit_before_quantity(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    child = cost_item(minutes="0.01")
    raw = cost_item(stage="R", price="0")
    make_bom(root.item_id, child.item_id, D(3))
    make_bom(child.item_id, raw.item_id, D(1))
    result = calculate(db_session, root, hourly_rate="30")
    assert result["labor_cost"] == "0.03"
    assert result["tree"]["children"][0]["own_labor_cost"] == "0.01"


def test_known_branch_partial_subtotal_and_issue_path(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    known = cost_item(stage="R", price="10")
    missing = cost_item(stage="R")
    make_bom(root.item_id, known.item_id, D(2))
    make_bom(root.item_id, missing.item_id, D(3))
    result = calculate(db_session, root)
    assert result["unit_cost"] == "20.00"
    assert result["status"] == "partial"
    issue = next(issue for issue in result["issues"] if issue["code"] == "missing_price")
    assert issue["path"] == [str(root.item_id), str(missing.item_id)]


def test_process_without_bom_does_not_use_purchase_price(cost_item, db_session):
    root = cost_item(price="900")
    result = calculate(db_session, root)
    assert result["unit_cost"] is None
    assert result["status"] == "unavailable"
    assert {"missing_bom", "missing_work_minutes"} <= codes(result)


def test_unfinished_child_propagates_even_when_root_completed(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    child = cost_item(minutes="0", complete=False)
    raw = cost_item(stage="R", price="5")
    make_bom(root.item_id, child.item_id, D(2))
    make_bom(child.item_id, raw.item_id, D(1))
    result = calculate(db_session, root)
    assert result["unit_cost"] == "10.00"
    assert result["status"] == "partial"
    assert "incomplete_child_bom" in codes(result)


def test_stock_exempt_raw_still_contributes(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    raw = cost_item(stage="R", price="10")
    raw.bom_stock_exempt = True
    make_bom(root.item_id, raw.item_id, D(2))
    result = calculate(db_session, root)
    assert result["unit_cost"] == "20.00"


def test_deleted_child_is_explicit_incomplete_branch(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    raw = cost_item(stage="R", price="10")
    raw.deleted_at = datetime(2026, 1, 1)
    make_bom(root.item_id, raw.item_id, D(1))
    result = calculate(db_session, root)
    assert result["unit_cost"] == "0.00"
    assert result["status"] == "partial"
    assert "missing_child" in codes(result)


def test_cycle_is_stopped_on_current_path(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    child = cost_item(minutes="0")
    make_bom(root.item_id, child.item_id, D(1))
    make_bom(child.item_id, root.item_id, D(1))
    result = calculate(db_session, root)
    assert result["status"] == "partial"
    assert "cycle" in codes(result)
    assert result["tree"]["children"][0]["children"][0]["children"] == []


def test_depth_limit_keeps_known_labor_and_reports_truncation(cost_item, make_bom, db_session):
    chain = [cost_item(minutes="1") for _ in range(12)]
    for parent, child in zip(chain, chain[1:]):
        make_bom(parent.item_id, child.item_id, D(1))
    result = calculate(db_session, chain[0])
    assert result["status"] == "partial"
    assert "max_depth_exceeded" in codes(result)


def test_node_limit_marks_partial_and_bounds_tree(cost_item, make_bom, db_session, monkeypatch):
    from app.services import cost

    monkeypatch.setattr(cost, "MAX_NODES", 3)
    root = cost_item(minutes="0")
    for _ in range(4):
        child = cost_item(stage="R", price="1")
        make_bom(root.item_id, child.item_id, D(1))
    result = calculate(db_session, root)
    assert result["status"] == "partial"
    assert result["unit_cost"] == "2.00"
    assert len(result["tree"]["children"]) == 2
    assert "max_nodes_exceeded" in codes(result)


def test_unit_mismatch_is_not_silently_converted(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    child = cost_item(stage="R", price="10")
    child.unit = "M"
    make_bom(root.item_id, child.item_id, D(2))
    result = calculate(db_session, root)
    assert result["status"] == "partial"
    assert result["material_cost"] is None
    assert "unit_mismatch" in codes(result)


def test_loading_does_not_query_once_per_tree_node(cost_item, make_bom, db_session):
    root = cost_item(minutes="0")
    for _ in range(5):
        raw = cost_item(stage="R", price="10")
        make_bom(root.item_id, raw.item_id, D(1))
    statements = []

    def capture(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", capture)
    try:
        result = calculate(db_session, root)
    finally:
        event.remove(db_session.bind, "before_cursor_execute", capture)
    assert result["unit_cost"] == "50.00"
    assert len(statements) <= 3
    assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)


def test_missing_root_has_explicit_error(db_session):
    from app.services.cost import get_item_cost

    with pytest.raises(ValueError, match="Item not found"):
        get_item_cost(db_session, uuid4(), D("6000"))


def test_deep_quantities_preserve_exact_amount_without_global_precision_change(cost_item, make_bom, db_session):
    from app.services.cost import _calculate_tree, _load_cost_graph

    chain = [cost_item(minutes="0") for _ in range(9)]
    chain.append(cost_item(stage="R", price="1.00"))
    for parent, child in zip(chain, chain[1:]):
        make_bom(parent.item_id, child.item_id, D(1000))
    items, edges = _load_cost_graph(db_session, [chain[0].item_id])

    with localcontext() as context:
        context.prec = 28
        tree = _calculate_tree(items, edges, chain[0].item_id, D("6000"))
        assert getcontext().prec == 28

    assert tree["status"] == "complete"
    assert tree["unit_cost"] == "1000000000000000000000000000.00"
    leaf = tree
    for _ in range(9):
        leaf = leaf["children"][0]
    assert leaf["required_quantity"] == 1000 ** 9
    assert leaf["amount"] == tree["unit_cost"]


@pytest.mark.parametrize("minutes,rate,expected", [
    ("9999999999.99", "9999999999999999.99", "1666666666664999998333333.33"),
    ("9999999999.97", "9999999999999976.67", "1666666666661662778333333.34"),
])
def test_maximum_rate_and_minutes_round_exactly_in_pure_calculation(cost_item, minutes, rate, expected):
    from app.services.cost import _calculate_tree

    root = cost_item(minutes=minutes)
    with localcontext() as context:
        context.prec = 28
        tree = _calculate_tree({root.item_id: root}, {}, root.item_id, D(rate))
        assert getcontext().prec == 28

    assert tree["own_labor_cost"] == expected
    assert tree["unit_cost"] == expected
