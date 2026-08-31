"""CP4 semantic idempotency 지문 계약."""

from __future__ import annotations

import uuid

from app.services.command_idempotency import (
    fingerprint_io_draft_submit,
    fingerprint_io_submit,
    fingerprint_stock_request_create,
)


def _io_payload(*, first_quantity: int = 1) -> dict:
    return {
        "requester_employee_id": str(uuid.uuid4()),
        "work_type": "receive",
        "sub_type": "receive_supplier",
        "reference_no": "PO-1",
        "notes": "memo",
        "client_request_id": "transport-only",
        "bundles": [
            {
                "bundle_id": str(uuid.uuid4()),
                "source_kind": "direct_item",
                "title": "UI title",
                "source_item_id": str(uuid.uuid4()),
                "source_mes_code": "UI-CODE",
                "quantity": first_quantity,
                "expanded_level": 1,
                "lines": [
                    {
                        "line_id": str(uuid.uuid4()),
                        "item_id": str(uuid.uuid4()),
                        "item_name": "UI item",
                        "mes_code": "UI-MES",
                        "unit": "EA",
                        "direction": "in",
                        "from_bucket": "none",
                        "from_department": None,
                        "to_bucket": "warehouse",
                        "to_department": None,
                        "quantity": first_quantity,
                        "included": True,
                        "selected": True,
                        "origin": "direct",
                        "shortage": 999,
                    },
                    {
                        "line_id": str(uuid.uuid4()),
                        "item_id": str(uuid.uuid4()),
                        "item_name": "UI item 2",
                        "unit": "EA",
                        "direction": "in",
                        "from_bucket": "none",
                        "to_bucket": "warehouse",
                        "quantity": 2,
                        "included": True,
                        "selected": True,
                        "origin": "direct",
                    },
                ],
            }
        ],
    }


def test_io_fingerprint_includes_actor_route_and_inventory_semantics() -> None:
    actor = uuid.uuid4()
    payload = _io_payload()
    same_semantics = _io_payload()
    same_semantics["bundles"] = payload["bundles"]
    same_semantics["client_request_id"] = "different-transport-key"
    same_semantics["bundles"][0]["title"] = "changed UI title"
    same_semantics["bundles"][0]["lines"][0]["item_name"] = "changed UI item"
    same_semantics["bundles"][0]["lines"][0]["shortage"] = 0

    baseline = fingerprint_io_submit(actor, payload)

    assert fingerprint_io_submit(actor, same_semantics) == baseline
    assert fingerprint_io_submit(uuid.uuid4(), payload) != baseline
    assert fingerprint_io_submit(actor, payload, route="/api/io/other") != baseline

    changed_quantity = _io_payload(first_quantity=3)
    changed_quantity["bundles"][0]["source_item_id"] = payload["bundles"][0][
        "source_item_id"
    ]
    changed_quantity["bundles"][0]["lines"] = payload["bundles"][0]["lines"]
    changed_quantity["bundles"][0]["lines"][0]["quantity"] = 3
    assert fingerprint_io_submit(actor, changed_quantity) != baseline

    reversed_lines = _io_payload()
    reversed_lines["bundles"] = payload["bundles"]
    reversed_lines["bundles"][0]["lines"] = list(
        reversed(reversed_lines["bundles"][0]["lines"])
    )
    assert fingerprint_io_submit(actor, reversed_lines) != baseline


def test_io_draft_submit_fingerprint_scopes_actor_route_batch_and_contents() -> None:
    actor = uuid.uuid4()
    batch_id = uuid.uuid4()
    payload = _io_payload()
    baseline = fingerprint_io_draft_submit(actor, batch_id, payload)

    assert fingerprint_io_draft_submit(actor, batch_id, payload) == baseline
    assert fingerprint_io_draft_submit(uuid.uuid4(), batch_id, payload) != baseline
    assert fingerprint_io_draft_submit(actor, uuid.uuid4(), payload) != baseline
    assert (
        fingerprint_io_draft_submit(
            actor,
            batch_id,
            payload,
            route="/api/io/submit",
        )
        != baseline
    )

    changed = {**payload, "notes": "changed after the original command"}
    assert fingerprint_io_draft_submit(actor, batch_id, changed) != baseline


def test_stock_request_fingerprint_preserves_order_and_excludes_transport_key() -> None:
    actor = uuid.uuid4()
    first_item = uuid.uuid4()
    second_item = uuid.uuid4()
    payload = {
        "requester_employee_id": str(actor),
        "request_type": "warehouse_to_dept",
        "reference_no": "R-1",
        "notes": "memo",
        "client_request_id": "key-a",
        "lines": [
            {
                "record_id": None,
                "item_id": str(first_item),
                "quantity": 1,
                "from_bucket": "warehouse",
                "from_department": None,
                "to_bucket": "production",
                "to_department": "조립",
            },
            {
                "record_id": None,
                "item_id": str(second_item),
                "quantity": 2,
                "from_bucket": "warehouse",
                "from_department": None,
                "to_bucket": "production",
                "to_department": "조립",
            },
        ],
    }
    reordered_object_keys = {
        "lines": [dict(reversed(list(line.items()))) for line in payload["lines"]],
        "client_request_id": "key-b",
        "notes": "memo",
        "reference_no": "R-1",
        "request_type": "warehouse_to_dept",
        "requester_employee_id": str(actor),
    }

    baseline = fingerprint_stock_request_create(actor, payload)

    assert fingerprint_stock_request_create(actor, reordered_object_keys) == baseline
    reversed_lines = {**payload, "lines": list(reversed(payload["lines"]))}
    assert fingerprint_stock_request_create(actor, reversed_lines) != baseline
    changed_quantity = {
        **payload,
        "lines": [{**payload["lines"][0], "quantity": 9}, payload["lines"][1]],
    }
    assert fingerprint_stock_request_create(actor, changed_quantity) != baseline
