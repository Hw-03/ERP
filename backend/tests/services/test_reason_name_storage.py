"""신규 표시명 길이와 긴 과거 사유의 제출 계약을 분리한다."""
import uuid

import pytest
from app.schemas.reason_categories import ReasonCategoryCreate, ReasonCategoryUpdate
from app.schemas.stock_request import StockRequestCreate, StockRequestDraftUpsert


@pytest.mark.parametrize("schema", [ReasonCategoryCreate, ReasonCategoryUpdate])
def test_short_unicode_name_can_expand_without_losing_identity(schema: type) -> None:
    name = chr(0xFDFA) * 6
    assert schema(requester_employee_id=uuid.uuid4(), name=name).name == name


@pytest.mark.parametrize("schema", [StockRequestCreate, StockRequestDraftUpsert])
def test_restored_historical_name_is_not_truncated_or_rejected(schema: type) -> None:
    name = "긴사유" * 40
    value = schema(
        requester_employee_id=uuid.uuid4(), request_type="scrap_normal",
        reason_category_id=uuid.uuid4(), reason_category=name,
        lines=[dict(item_id=uuid.uuid4(), quantity=1, from_bucket="warehouse", to_bucket="defective")],
    )
    assert value.reason_category == name
