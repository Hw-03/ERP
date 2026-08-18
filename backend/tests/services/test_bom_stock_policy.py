"""BOM 자동 재고 미반영 정책의 순수 규칙 회귀 테스트."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

from app.services.bom_stock_policy import (
    BOM_STOCK_EXEMPT_NOTE,
    has_valid_bom_auto_token,
    issue_bom_auto_token,
    should_skip_bom_inventory,
)


def test_flagged_item_skips_only_bom_generated_inventory_effects():
    item = SimpleNamespace(bom_stock_exempt=True)

    assert should_skip_bom_inventory(item, bom_generated=True) is True
    assert BOM_STOCK_EXEMPT_NOTE == "BOM 재고 미반영"


def test_flagged_item_keeps_manual_inventory_effects():
    item = SimpleNamespace(bom_stock_exempt=True)

    assert should_skip_bom_inventory(item, bom_generated=False) is False


def test_unflagged_item_keeps_bom_generated_inventory_effects():
    item = SimpleNamespace(bom_stock_exempt=False)

    assert should_skip_bom_inventory(item, bom_generated=True) is False


def test_server_issued_bom_auto_token_cannot_be_reused_for_another_child(db_session):
    parent_id = uuid.uuid4()
    child_id = uuid.uuid4()
    claims = {
        "bundle_id": uuid.uuid4(),
        "line_id": uuid.uuid4(),
        "source_item_id": parent_id,
        "item_id": child_id,
        "work_type": "process",
        "sub_type": "produce",
        "direction": "out",
        "from_bucket": "production",
        "from_department": "조립",
        "to_bucket": "none",
        "to_department": None,
    }

    token = issue_bom_auto_token(db_session, flow="io", claims=claims)

    assert has_valid_bom_auto_token(db_session, flow="io", claims=claims, token=token)
    assert not has_valid_bom_auto_token(
        db_session,
        flow="io",
        claims={**claims, "item_id": uuid.uuid4()},
        token=token,
    )
