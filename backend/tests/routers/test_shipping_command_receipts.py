from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    InventoryOperation,
    ShippingAllocation,
    ShippingCommandReceipt,
    ShippingRequest,
    ShippingRequestEvent,
    ShippingRequestStatusEnum,
    SystemSetting,
)
from app.services import shipping as shipping_svc


def _shipping_command_case(db_session, client, make_item, make_location):
    actor = Employee(
        employee_code=f"SHIP-CMD-{uuid.uuid4().hex[:8]}",
        name="출하 명령 작업자",
        role="worker",
        department=DepartmentEnum.SHIPPING.value,
        level=EmployeeLevelEnum.STAFF,
        display_order=0,
        is_active=True,
    )
    final_pa = make_item(name="명령 PA", process_type_code="PA")
    final_pf = make_item(name="명령 PF", process_type_code="PF")
    make_location(
        final_pf.item_id,
        department=DepartmentEnum.SHIPPING,
        quantity=Decimal("4"),
    )
    request = ShippingRequest(
        status=ShippingRequestStatusEnum.PREPARING,
        base_pf_item_id=final_pf.item_id,
        final_pa_item_id=final_pa.item_id,
        final_pf_item_id=final_pf.item_id,
        request_quantity=1,
        invoice_number="CMD-001",
    )
    db_session.add_all(
        [
            actor,
            request,
            SystemSetting(
                setting_key="inventory_operation_cutover_at",
                setting_value="2026-01-01T00:00:00",
            ),
        ]
    )
    db_session.commit()
    client.headers.update({"X-Actor-Employee-Id": str(actor.employee_id)})
    return actor, request


def _command_counts(db_session) -> tuple[int, int, int, int]:
    return (
        db_session.query(ShippingCommandReceipt).count(),
        db_session.query(ShippingAllocation).count(),
        db_session.query(ShippingRequestEvent).count(),
        db_session.query(InventoryOperation).count(),
    )


def test_prepare_replays_original_response_and_rejects_key_reuse(
    db_session,
    client,
    make_item,
    make_location,
):
    actor, request = _shipping_command_case(
        db_session,
        client,
        make_item,
        make_location,
    )
    key = str(uuid.uuid4())
    route = f"/api/shipping/requests/{request.request_id}/prepare-complete"
    payload = {
        "serial_numbers": "SN-CMD-001",
        "client_request_id": key,
        "expected_status": "PREPARING",
    }

    first = client.post(route, json=payload)
    assert first.status_code == 200, first.text
    first_counts = _command_counts(db_session)
    assert first_counts == (1, 1, 1, 1)

    replay = client.post(
        route,
        json={
            **payload,
            "companion_lines": [
                {
                    "item_id": str(uuid.uuid4()),
                    "quantity": 99,
                    "unit": "EA",
                }
            ],
        },
    )
    assert replay.status_code == 200, replay.text
    assert replay.json() == first.json()
    assert _command_counts(db_session) == first_counts

    conflict = client.post(
        route,
        json={**payload, "serial_numbers": "SN-DIFFERENT"},
    )
    assert conflict.status_code == 409, conflict.text
    assert conflict.json()["detail"]["code"] == "IDEMPOTENCY_CONFLICT"
    assert _command_counts(db_session) == first_counts

    receipt = db_session.query(ShippingCommandReceipt).one()
    assert receipt.actor_employee_id == actor.employee_id
    assert receipt.route == "/api/shipping/requests/{request_id}/prepare-complete"
    assert receipt.command_kind == "PREPARE_COMPLETE"
    assert receipt.client_request_id == uuid.UUID(key)
    assert len(receipt.semantic_fingerprint) == 64
    assert receipt.expected_status == "PREPARING"
    assert receipt.result_status == "PREPARED"
    assert receipt.operation_id is not None
    assert receipt.response_snapshot == first.json()


def test_shipping_expected_status_conflict_has_current_status_and_no_mutation(
    db_session,
    client,
    make_item,
    make_location,
):
    _actor, request = _shipping_command_case(
        db_session,
        client,
        make_item,
        make_location,
    )
    before = _command_counts(db_session)

    response = client.post(
        f"/api/shipping/requests/{request.request_id}/prepare-complete",
        json={
            "serial_numbers": "SN-CONFLICT",
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARED",
        },
    )

    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail["code"] == "SHIPPING_STATE_CONFLICT"
    assert detail["extra"]["current_status"] == "PREPARING"
    assert _command_counts(db_session) == before
    db_session.refresh(request)
    assert request.status == ShippingRequestStatusEnum.PREPARING


def test_shipping_stale_transition_timestamp_blocks_inverse_command(
    db_session,
    client,
    make_item,
    make_location,
):
    _actor, request = _shipping_command_case(
        db_session,
        client,
        make_item,
        make_location,
    )
    base = f"/api/shipping/requests/{request.request_id}"
    original_updated_at = request.updated_at.isoformat() + "+00:00"

    prepared = client.post(
        f"{base}/prepare-complete",
        json={
            "serial_numbers": "SN-VERSION",
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARING",
            "expected_updated_at": original_updated_at,
        },
    )
    assert prepared.status_code == 200, prepared.text

    stale_inverse = client.post(
        f"{base}/prepare-cancel",
        json={
            "reason": "stale inverse",
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARED",
            "expected_updated_at": original_updated_at,
        },
    )

    assert stale_inverse.status_code == 409, stale_inverse.text
    assert stale_inverse.json()["detail"]["code"] == "SHIPPING_STATE_CONFLICT"
    db_session.refresh(request)
    assert request.status == ShippingRequestStatusEnum.PREPARED


def test_shipping_command_failure_rolls_back_receipt_and_same_key_can_retry(
    db_session,
    client,
    make_item,
    make_location,
    monkeypatch,
):
    _actor, request = _shipping_command_case(
        db_session,
        client,
        make_item,
        make_location,
    )
    key = str(uuid.uuid4())
    payload = {
        "serial_numbers": "SN-ROLLBACK",
        "client_request_id": key,
        "expected_status": "PREPARING",
    }
    original_record_event = shipping_svc._record_event

    def fail_after_mutation(*args, **kwargs):
        raise RuntimeError("forced response-loss boundary failure")

    monkeypatch.setattr(shipping_svc, "_record_event", fail_after_mutation)
    with pytest.raises(RuntimeError, match="forced response-loss"):
        client.post(
            f"/api/shipping/requests/{request.request_id}/prepare-complete",
            json=payload,
        )
    assert _command_counts(db_session) == (0, 0, 0, 0)
    db_session.refresh(request)
    assert request.status == ShippingRequestStatusEnum.PREPARING

    monkeypatch.setattr(shipping_svc, "_record_event", original_record_event)
    retry = client.post(
        f"/api/shipping/requests/{request.request_id}/prepare-complete",
        json=payload,
    )
    assert retry.status_code == 200, retry.text
    assert _command_counts(db_session) == (1, 1, 1, 1)


def test_keyless_shipping_command_returns_deprecation_warning(
    db_session,
    client,
    make_item,
    make_location,
):
    _actor, request = _shipping_command_case(
        db_session,
        client,
        make_item,
        make_location,
    )

    response = client.post(
        f"/api/shipping/requests/{request.request_id}/prepare-complete",
        json={
            "serial_numbers": "SN-LEGACY",
            "expected_status": "PREPARING",
        },
    )

    assert response.status_code == 200, response.text
    assert response.headers["Deprecation"] == "true"
    assert "client_request_id" in response.headers["Warning"]


def test_prepare_and_pickup_cancellations_restore_previous_state(
    db_session,
    client,
    make_item,
    make_location,
):
    _actor, request = _shipping_command_case(
        db_session,
        client,
        make_item,
        make_location,
    )
    base = f"/api/shipping/requests/{request.request_id}"

    prepared = client.post(
        f"{base}/prepare-complete",
        json={
            "serial_numbers": "SN-CANCEL",
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARING",
        },
    )
    assert prepared.status_code == 200, prepared.text
    prepare_cancelled = client.post(
        f"{base}/prepare-cancel",
        json={
            "reason": "구성 재확인",
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARED",
        },
    )
    assert prepare_cancelled.status_code == 200, prepare_cancelled.text
    assert prepare_cancelled.json()["status"] == "PREPARING"
    assert {row.status for row in db_session.query(ShippingAllocation).all()} == {
        "RELEASED"
    }

    prepared_again = client.post(
        f"{base}/prepare-complete",
        json={
            "serial_numbers": "SN-CANCEL-2",
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARING",
        },
    )
    assert prepared_again.status_code == 200, prepared_again.text
    pickup = client.post(
        f"{base}/pickup-complete",
        json={
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PREPARED",
        },
    )
    assert pickup.status_code == 200, pickup.text
    pickup_cancelled = client.post(
        f"{base}/pickup-cancel",
        json={
            "client_request_id": str(uuid.uuid4()),
            "expected_status": "PICKED_UP",
        },
    )
    assert pickup_cancelled.status_code == 200, pickup_cancelled.text
    assert pickup_cancelled.json()["status"] == "PREPARED"
    assert pickup_cancelled.json()["picked_up_at"] is None
    assert {
        row.status
        for row in db_session.query(ShippingAllocation)
        .filter(ShippingAllocation.released_at.is_(None))
        .all()
    } == {"RESERVED"}
    assert db_session.query(ShippingCommandReceipt).count() == 5
