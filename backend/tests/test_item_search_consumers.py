"""Consumer contracts preserve field scope, snapshots, and page boundaries."""
from datetime import datetime, timedelta
from uuid import UUID

import pytest

from app.models import ItemAlias, ItemSynonymGroup, ItemSynonymTerm, ShippingRequest, ShippingRequestStatusEnum, TransactionLog, TransactionTypeEnum
from app.services import stocktake_reads
from app.services.inventory_conflicts import InventoryConflict
from tests.services.test_stocktake_counts import setup_round


def dictionary(db, item, alias="Power Cell"):
    group = ItemSynonymGroup()
    db.add(group)
    db.flush()
    db.add_all([ItemSynonymTerm(group_id=group.group_id, term=term, normalized_term=term.lower())
                for term in ["Battery", "Cell"]])
    db.add(ItemAlias(item_id=item.item_id, alias=alias, normalized_alias=alias.lower().replace(" ", "")))
    db.commit()


def test_transaction_list_and_exports_apply_synonyms_only_to_item_fields(client, db_session, make_item):
    item = make_item(name="Battery")
    unrelated = make_item(name="Different")
    dictionary(db_session, item)
    db_session.add_all([TransactionLog(item_id=row.item_id, transaction_type=TransactionTypeEnum.RECEIVE,
        quantity_change=1, produced_by="Battery", created_at=datetime.utcnow()) for row in [item, unrelated]])
    db_session.commit()
    response = client.get("/api/inventory/transactions", params={"search": "Cell"})
    assert [row["item_id"] for row in response.json()] == [str(item.item_id)]
    today = (datetime.utcnow() + timedelta(hours=9)).date().isoformat()
    for extension in ["csv", "xlsx"]:
        response = client.get(f"/api/inventory/transactions/export.{extension}",
            params={"search": "Cell", "start_date": today, "end_date": today})
        assert response.status_code == 200
        if extension == "csv":
            assert "Battery" in response.content.decode("utf-8-sig")
            assert "Different" not in response.content.decode("utf-8-sig")


def test_shipping_alias_scope_preserves_final_custom_base_coalesce(client, db_session, make_item):
    base = make_item(name="Base", process_type_code="PF")
    final = make_item(name="Final", process_type_code="PF")
    dictionary(db_session, base)
    db_session.add(ItemAlias(item_id=final.item_id, alias="Final Cell", normalized_alias="finalcell"))
    rows = [ShippingRequest(base_pf_item_id=base.item_id, final_pf_item_id=final_id, custom_pf_name=custom,
        status=ShippingRequestStatusEnum.CANCELLED, cancelled_at=datetime.utcnow())
        for final_id, custom in [(None, None), (None, "Custom name"), (final.item_id, "Custom name")]]
    db_session.add_all(rows)
    db_session.commit()
    response = client.get("/api/shipping/history", params={"q": "Power"})
    assert [row["request_id"] for row in response.json()["requests"]] == [str(rows[0].request_id)]
    response = client.get("/api/shipping/history", params={"q": "Final Cell"})
    assert [row["request_id"] for row in response.json()["requests"]] == [str(rows[2].request_id)]
    cursor = client.get("/api/shipping/history", params={"limit": 1}).json()["next_cursor"]
    db_session.add(ItemAlias(item_id=base.item_id, alias="Changed", normalized_alias="changed"))
    db_session.commit()
    stale = client.get("/api/shipping/history", params={"limit": 1, "cursor": cursor})
    assert stale.status_code == 409 and stale.json()["detail"]["code"] == "SEARCH_CONFIG_STALE"


def test_stocktake_snapshot_search_and_config_change_restart_cursor(db_session, make_item):
    env = setup_round(db_session, make_item, new_policy=True)
    round_id = UUID(env[3]["round_id"])
    env[2].item_name = "Current Battery"
    db_session.commit()
    dictionary(db_session, env[2])
    assert len(stocktake_reads.targets(db_session, round_id, search="Cell")["items"]) == 2
    assert len(stocktake_reads.targets(db_session, round_id, search="Counted item")["items"]) == 2
    cursor = stocktake_reads.targets(db_session, round_id, limit=1)["next_cursor"]
    db_session.add(ItemAlias(item_id=env[2].item_id, alias="Changed", normalized_alias="changed"))
    db_session.commit()
    with pytest.raises(InventoryConflict) as error:
        stocktake_reads.targets(db_session, round_id, cursor=cursor, limit=1)
    assert error.value.code == "TARGET_CURSOR_STALE"
