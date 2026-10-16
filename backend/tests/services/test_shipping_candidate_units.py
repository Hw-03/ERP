"""BOM reuse requires matching quantities and units at both PA and PF levels."""
from decimal import Decimal

import pytest

from app.services import shipping as shipping_svc


@pytest.mark.parametrize("mismatched_stage", ["PA", "PF"])
def test_candidate_with_different_bom_unit_is_not_an_exact_match(db_session, make_item, make_bom, mismatched_stage):
    original = make_item(name="original component", process_type_code="AF", serial_no=1)
    requested = make_item(name="requested component", process_type_code="AF", serial_no=2)
    base_pa = make_item(name="base PA", process_type_code="PA", serial_no=3)
    base_pf = make_item(name="base PF", process_type_code="PF", serial_no=4)
    candidate_pa = make_item(name="candidate PA", process_type_code="PA", serial_no=5)
    candidate_pf = make_item(name="candidate PF", process_type_code="PF", serial_no=6)
    make_bom(base_pa.item_id, original.item_id, Decimal("1"))
    make_bom(base_pf.item_id, base_pa.item_id, Decimal("1"))
    candidate_pa_bom = make_bom(candidate_pa.item_id, requested.item_id, Decimal("1"))
    candidate_pf_bom = make_bom(candidate_pf.item_id, candidate_pa.item_id, Decimal("1"))
    (candidate_pa_bom if mismatched_stage == "PA" else candidate_pf_bom).unit = "SET"
    db_session.commit()
    lines = [
        {"parent_stage": "PA", "child_item_id": requested.item_id, "quantity": 1, "unit": "EA", "included": True},
        {"parent_stage": "PF", "child_item_id": base_pa.item_id, "quantity": 1, "unit": "EA", "included": True},
    ]
    result = shipping_svc.match_bom(db_session, lines, base_pf_item_id=base_pf.item_id)
    assert result["base_pf_matches"] is False
    assert result["pf_candidates"] == []
    matching_lines = [{**line, "unit": "SET" if line["parent_stage"] == mismatched_stage else "EA"} for line in lines]
    matching = shipping_svc.match_bom(db_session, matching_lines, base_pf_item_id=base_pf.item_id)
    assert [row["pf_item_id"] for row in matching["pf_candidates"]] == [candidate_pf.item_id]
    with pytest.raises(shipping_svc.ShippingError):
        shipping_svc.create_request(db_session, {"base_pf_item_id": base_pf.item_id,
            "bom_lines": lines, "finalization_mode": "REUSE_CANDIDATE", "reuse_pf_item_id": candidate_pf.item_id})
