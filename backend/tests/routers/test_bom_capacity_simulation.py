"""General BOM previews keep existing stock and additional capacity semantics."""

from decimal import Decimal
import uuid

from sqlalchemy import event

from app.models import BOM, Inventory, TransactionLog


def _preview(client, root, excluded=()):
    return client.post(f"/api/bom/{root.item_id}/capacity/simulate", json={
        "excluded_item_ids": [str(item.item_id) for item in excluded],
    })


def test_bom_preview_reports_additional_quantity_and_active_limiting_item(
    client, db_session, make_item, make_bom,
):
    root = make_item(name="AF root", process_type_code="AF", warehouse_qty=Decimal("5"))
    scarce = make_item(name="Scarce", process_type_code="AR", warehouse_qty=Decimal("10"), pending=Decimal("4"))
    other = make_item(name="Other", process_type_code="AR", warehouse_qty=Decimal("20"))
    make_bom(root.item_id, scarce.item_id, Decimal("2"))
    make_bom(root.item_id, other.item_id, Decimal("1"))
    db_session.commit()
    statements = []

    def record(_connection, _cursor, statement, _params, _context, _many):
        statements.append(statement)

    event.listen(db_session.bind, "before_cursor_execute", record)
    try:
        tree = client.get(f"/api/bom/{root.item_id}/tree").json()
        baseline = _preview(client, root)
        assert baseline.status_code == 200, baseline.text
        assert baseline.json()["additional_producible_quantity"] == tree["additional_producible_quantity"] == 3
        assert tree["additional_producible_limiting_item_id"] == str(scarce.item_id)
        assert baseline.json()["additional_producible_limiting_item_id"] == str(scarce.item_id)
        changed = _preview(client, root, [scarce])
        assert changed.status_code == 200, changed.text
        assert changed.json()["additional_producible_quantity"] == 20
        assert changed.json()["additional_producible_limiting_item_id"] == str(other.item_id)
        assert _preview(client, root).json() == baseline.json()
    finally:
        event.remove(db_session.bind, "before_cursor_execute", record)
    # Existing HTTP audit middleware records every POST separately without a data revision.
    business_writes = [sql for sql in statements
                       if sql.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))
                       and not sql.lstrip().upper().startswith("INSERT INTO ACTIVITY_AUDIT_LOGS")]
    assert not business_writes
    assert db_session.query(BOM).count() == 2
    assert db_session.query(TransactionLog).count() == 0
    assert db_session.query(Inventory).filter_by(item_id=root.item_id).one().warehouse_qty == 5


def test_bom_preview_shares_material_once_and_propagates_free_nodes(
    client, db_session, make_item, make_bom,
):
    root = make_item(name="AA root", process_type_code="AA", warehouse_qty=Decimal("4"))
    left = make_item(name="Left", process_type_code="AA", warehouse_qty=Decimal("1"))
    right = make_item(name="Right", process_type_code="AA")
    shared = make_item(name="Shared", process_type_code="AR", warehouse_qty=Decimal("10"))
    for parent, child in [(root, left), (root, right), (left, shared), (right, shared)]:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
    db_session.commit()
    baseline = _preview(client, root).json()
    assert baseline["additional_producible_quantity"] == 5
    assert baseline["additional_producible_limiting_item_id"] == str(shared.item_id)
    assert _preview(client, root, [left]).json()["additional_producible_quantity"] == 10
    unconstrained = _preview(client, root, [shared]).json()
    assert unconstrained["additional_producible_quantity"] is None
    assert unconstrained["additional_producible_status"] == "no_constraints"
    assert unconstrained["additional_producible_limiting_item_id"] is None


def test_bom_preview_unavailable_and_validation(client, make_item):
    root = make_item(name="Raw", process_type_code="AR")
    foreign = make_item(name="Foreign", process_type_code="AR")
    empty = _preview(client, root)
    assert empty.status_code == 200, empty.text
    assert empty.json()["additional_producible_quantity"] is None
    assert empty.json()["additional_producible_status"] == "unavailable"
    assert empty.json()["fast_production"] is None
    assert empty.json()["fast_production_status"] == "unavailable"
    assert empty.json()["total_production"] is None
    assert empty.json()["total_production_status"] == "unavailable"
    assert _preview(client, root, [root]).status_code == 422
    assert _preview(client, root, [foreign]).status_code == 422
    assert client.post(f"/api/bom/{uuid.uuid4()}/capacity/simulate", json={"excluded_item_ids": []}).status_code == 404


def test_bom_root_three_quantities_keep_fast_at_direct_stock(client, db_session, make_item, make_bom):
    root = make_item(name="Current AF", process_type_code="AF", warehouse_qty=Decimal("5"))
    assembly = make_item(name="Direct AA", process_type_code="AA", warehouse_qty=Decimal("2"))
    raw = make_item(name="Buildable raw", process_type_code="AR", warehouse_qty=Decimal("100"))
    make_bom(root.item_id, assembly.item_id, Decimal("1"))
    make_bom(assembly.item_id, raw.item_id, Decimal("5"))
    db_session.commit()
    tree = client.get(f"/api/bom/{root.item_id}/tree").json()
    result = _preview(client, root).json()
    assert result["ship_ready"] == tree["ship_ready"] == 5
    assert result["fast_production"] == tree["fast_production"] == 2
    assert result["fast_production_limiting_item_id"] == str(assembly.item_id)
    assert result["total_production"] == tree["total_production"] == 27
    assert result["additional_producible_quantity"] == 22
    assert result["total_production_limiting_item_id"] == str(raw.item_id)
    assert result["fast_production_status"] == result["total_production_status"] == "finite"
    changed = _preview(client, root, [raw]).json()
    assert changed["fast_production"] == 2
    assert changed["total_production"] is None
    assert changed["total_production_status"] == "no_constraints"
    free = _preview(client, root, [assembly]).json()
    assert free["fast_production"] is None
    assert free["fast_production_status"] == "no_constraints"
    assert free["total_production"] is None


def test_general_bom_pf_keeps_existing_fast_packaging_definition(client, db_session, make_item, make_bom):
    pf = make_item(name="PF", process_type_code="PF", warehouse_qty=Decimal("4"))
    pa = make_item(name="PA", process_type_code="PA")
    af = make_item(name="AF", process_type_code="AF", warehouse_qty=Decimal("7"))
    packing = make_item(name="Packing", process_type_code="PR", warehouse_qty=Decimal("10"))
    raw = make_item(name="AF raw", process_type_code="AR", warehouse_qty=Decimal("20"))
    for parent, child in [(pf, pa), (pa, af), (pa, packing), (af, raw)]:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
    db_session.commit()
    baseline = next(row for row in client.get("/api/production/capacity").json()["af"]["pf_variants"]
                    if row["pf_item_id"] == str(pf.item_id))
    result = _preview(client, pf).json()
    for field in ("ship_ready", "fast_production", "total_production", "fast_production_limiting_item_id", "total_production_limiting_item_id"):
        assert result[field] == baseline[field]


def test_root_fast_sums_duplicate_direct_requirements_and_preserves_stock_reservations():
    from types import SimpleNamespace
    from app.services.production_capacity_simulation import compute_bom_capacity_values
    from app.services.stock_math import StockFigures

    root_id, part_id = uuid.uuid4(), uuid.uuid4()
    result = compute_bom_capacity_values(
        root_id,
        baseline={root_id: [(part_id, Decimal("2")), (part_id, Decimal("3"))]},
        excluded=set(),
        figures={
            root_id: StockFigures(warehouse_qty=Decimal("9"), pending=Decimal("2"), shipping_reserved=Decimal("3")),
            part_id: StockFigures(warehouse_qty=Decimal("21"), shipping_reserved=Decimal("1")),
        },
        items_map={root_id: SimpleNamespace(process_type_code="AA")},
    )
    assert result["ship_ready"] == 7
    assert result["fast_production"] == 4
    assert result["total_production"] == 8
    assert result["additional_producible_quantity"] == 4
    assert result["fast_production_limiting_item_id"] == str(part_id)
