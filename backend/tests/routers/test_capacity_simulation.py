"""Temporary capacity previews never persist BOM edits."""

from decimal import Decimal

import pytest

from app.models import BOM, Inventory, TransactionLog
from app.services.production_capacity import compute_capacity
from app.services.production_capacity_simulation import simulate_capacity
from app.services.stock_math import StockFigures


@pytest.fixture()
def scenario(db_session, make_item, make_bom):
    pf = make_item(name="출하품", process_type_code="PF", warehouse_qty=Decimal("2"))
    pa = make_item(name="포장품", process_type_code="PA", warehouse_qty=Decimal("0"))
    af = make_item(name="조립품", process_type_code="AF", warehouse_qty=Decimal("30"))
    part = make_item(name="조립 자재", process_type_code="AR", warehouse_qty=Decimal("10"))
    scarce = make_item(name="7개 병목", process_type_code="AR", warehouse_qty=Decimal("7"))
    other = make_item(name="다음 병목", process_type_code="AR", warehouse_qty=Decimal("20"))
    for parent, child in [(pf, pa), (pa, af), (af, part), (pa, scarce), (pa, other)]:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
    db_session.commit()
    return pf, pa, af, part, scarce, other


def preview(client, pf, *excluded):
    return client.post("/api/production/capacity/simulate", json={
        "pf_item_id": str(pf.item_id),
        "excluded_item_ids": [str(item.item_id) for item in excluded],
    })


def test_capacity_limiting_ids_follow_exclusions(client, scenario):
    pf, pa, af, part, scarce, other = scenario
    baseline = next(row for row in client.get("/api/production/capacity").json()["af"]["pf_variants"]
                    if row["pf_item_id"] == str(pf.item_id))
    for key in ("fast_production_limiting_item_id", "total_production_limiting_item_id"):
        assert baseline[key] == str(scarce.item_id)
        assert preview(client, pf).json()[key] == baseline[key]
        assert preview(client, pf, scarce).json()[key] == str(other.item_id)
        assert preview(client, pf, af, scarce, other).json()[key] is None
    remaining_af = preview(client, pf, scarce, other).json()
    assert remaining_af["fast_production_limiting_item_id"] == str(af.item_id)
    assert remaining_af["total_production_limiting_item_id"] == str(part.item_id)


def test_preview_excludes_bottleneck_without_persisting(client, db_session, scenario):
    pf, pa, af, part, scarce, other = scenario
    before = (db_session.query(BOM).count(), db_session.query(TransactionLog).count(),
              [(row.item_id, row.warehouse_qty) for row in db_session.query(Inventory).all()])
    baseline = next(row for row in compute_capacity(db_session)["af"]["pf_variants"]
                    if row["pf_item_id"] == str(pf.item_id))
    empty = preview(client, pf)
    assert empty.status_code == 200, empty.text
    assert all(empty.json()[key] == baseline[key] for key in ("ship_ready", "fast_production", "total_production"))
    result = preview(client, pf, scarce)
    assert result.status_code == 200, result.text
    assert result.json()["ship_ready"] == 2
    assert result.json()["fast_production"] == 20
    assert result.json()["total_production"] == 22
    assert preview(client, pf).json() == empty.json()
    assert before == (db_session.query(BOM).count(), db_session.query(TransactionLog).count(),
                      [(row.item_id, row.warehouse_qty) for row in db_session.query(Inventory).all()])


def test_preview_free_nodes_and_fast_af_boundary(client, scenario):
    pf, pa, af, part, scarce, other = scenario
    result = preview(client, pf, part, scarce, other).json()
    assert result["fast_production"] == 30
    assert result["fast_production_status"] == "finite"
    assert result["total_production"] is None
    assert result["total_production_status"] == "no_constraints"
    result = preview(client, pf, af, scarce, other).json()
    assert result["fast_production"] is None
    assert result["fast_production_status"] == "no_constraints"
    assert result["total_production"] is None


def test_preview_rejects_top_rows_and_foreign_items(client, scenario, make_item):
    pf, pa, af, part, scarce, other = scenario
    foreign = make_item(name="외부", process_type_code="AR")
    assert preview(client, pf, pf).status_code == 422
    assert preview(client, pf, pa).status_code == 422
    assert preview(client, pf, foreign).status_code == 422
    assert preview(client, af).status_code == 422
    response = client.post("/api/production/capacity/simulate", json={
        "pf_item_id": "00000000-0000-0000-0000-000000000000", "excluded_item_ids": [],
    })
    assert response.status_code == 404


def test_preview_shared_parts_and_intermediate_stock(db_session, scenario, make_item, make_bom):
    pf, pa, af, part, scarce, other = scenario
    left = make_item(name="왼쪽 중간재", process_type_code="AA", warehouse_qty=Decimal("1"))
    right = make_item(name="오른쪽 중간재", process_type_code="AA", warehouse_qty=Decimal("0"))
    shared = make_item(name="공유 자재", process_type_code="AR", warehouse_qty=Decimal("10"))
    db_session.query(BOM).filter_by(parent_item_id=af.item_id).delete()
    for parent, child in [(af, left), (af, right), (left, shared), (right, shared)]:
        make_bom(parent.item_id, child.item_id, Decimal("1"))
    db_session.commit()
    excluded = [scarce.item_id, other.item_id]
    assert simulate_capacity(db_session, pf.item_id, excluded)["total_production"] == 37
    assert simulate_capacity(db_session, pf.item_id, excluded + [left.item_id])["total_production"] == 42
    result = simulate_capacity(db_session, pf.item_id, excluded + [shared.item_id])
    assert result["total_production"] is None
    assert result["fast_production"] == 30


def test_preview_reservations_and_duplicate_exclusions(db_session, scenario, monkeypatch):
    from app.services import stock_math

    pf, pa, af, part, scarce, other = scenario
    monkeypatch.setattr(stock_math, "bulk_compute", lambda *_: {
        pf.item_id: StockFigures(warehouse_qty=Decimal("9"), pending=Decimal("2"), shipping_reserved=Decimal("3")),
        af.item_id: StockFigures(warehouse_qty=Decimal("30"), pending=Decimal("4")),
        part.item_id: StockFigures(warehouse_qty=Decimal("100")),
        scarce.item_id: StockFigures(warehouse_qty=Decimal("7")),
        other.item_id: StockFigures(warehouse_qty=Decimal("20"), shipping_reserved=Decimal("5")),
    })
    result = simulate_capacity(db_session, pf.item_id, [scarce.item_id, scarce.item_id])
    assert result["ship_ready"] == 7
    assert result["fast_production"] == 15
    assert result["total_production"] == 19
