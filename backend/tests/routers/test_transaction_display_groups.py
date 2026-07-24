"""대표 행 단위 입출고 내역 페이지 API 계약 테스트."""

from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from app.models import Employee, IoBatch, TransactionLog, TransactionTypeEnum


def _add_log(
    db_session,
    item,
    *,
    created_at: datetime,
    reference_no: str | None = None,
    operation_batch_id=None,
    transaction_type: TransactionTypeEnum = TransactionTypeEnum.RECEIVE,
    shipping_phase: str | None = None,
    produced_by: str | None = None,
    department: str | None = None,
    reason_category: str | None = None,
    reason_memo: str | None = None,
) -> TransactionLog:
    log = TransactionLog(
        item_id=item.item_id,
        transaction_type=transaction_type,
        quantity_change=Decimal("1"),
        quantity_before=Decimal("0"),
        quantity_after=Decimal("1"),
        reference_no=reference_no,
        operation_batch_id=operation_batch_id,
        shipping_phase=shipping_phase,
        produced_by=produced_by,
        department=department,
        reason_category=reason_category,
        reason_memo=reason_memo,
        created_at=created_at,
    )
    db_session.add(log)
    db_session.flush()
    return log


def _add_batch(db_session, suffix: str) -> IoBatch:
    employee = Employee(
        employee_code=f"DISPLAY-GROUP-{suffix}",
        name=f"요청자 {suffix}",
        role="operator",
        department="조립",
    )
    db_session.add(employee)
    db_session.flush()
    batch = IoBatch(
        work_type="process",
        sub_type="produce",
        status="completed",
        requester_employee_id=employee.employee_id,
        requester_name=employee.name,
        requester_department=employee.department,
    )
    db_session.add(batch)
    db_session.flush()
    return batch


def test_display_groups_pages_complete_groups_by_representative_row(client, db_session, make_item):
    item = make_item(name="대표행 페이지 품목")
    base = datetime(2026, 7, 15, 12, 0, 0)
    batch = _add_batch(db_session, "묶음")
    batch.submitted_at = base
    batch_logs = [
        _add_log(db_session, item, created_at=base - timedelta(minutes=index), operation_batch_id=batch.batch_id)
        for index in range(3)
    ]
    solo_logs = [
        _add_log(db_session, item, created_at=base - timedelta(hours=1, minutes=index))
        for index in range(100)
    ]
    db_session.commit()

    first = client.get("/api/inventory/transactions/display-groups")

    assert first.status_code == 200, first.text
    first_body = first.json()
    assert len(first_body["groups"]) == 100
    assert first_body["groups"][0]["type"] == "op_batch"
    assert {row["log_id"] for row in first_body["groups"][0]["logs"]} == {
        str(log.log_id) for log in batch_logs
    }
    assert first_body["has_more"] is True
    assert first_body["next_cursor"]

    second = client.get(
        "/api/inventory/transactions/display-groups",
        params={"cursor": first_body["next_cursor"]},
    )

    assert second.status_code == 200, second.text
    second_body = second.json()
    assert len(second_body["groups"]) == 1
    assert second_body["groups"][0]["type"] == "solo"
    assert second_body["groups"][0]["logs"][0]["log_id"] == str(solo_logs[-1].log_id)
    assert second_body["has_more"] is False
    assert second_body["next_cursor"] is None


def test_display_groups_applies_existing_search_filter_and_sort(client, db_session, make_item):
    alpha = make_item(name="알파 모델")
    beta = make_item(name="베타 모델")
    base = datetime(2026, 7, 15, 12, 0, 0)
    old_alpha = _add_log(db_session, alpha, created_at=base - timedelta(days=1))
    newest_alpha = _add_log(db_session, alpha, created_at=base)
    _add_log(db_session, beta, created_at=base + timedelta(hours=1))
    db_session.commit()

    response = client.get(
        "/api/inventory/transactions/display-groups",
        params={"search": "알파"},
    )

    assert response.status_code == 200, response.text
    groups = response.json()["groups"]
    assert [group["logs"][0]["log_id"] for group in groups] == [
        str(newest_alpha.log_id),
        str(old_alpha.log_id),
    ]


def test_transaction_common_search_ignores_spaces_and_separators(client, db_session, make_item):
    item = make_item(name="Transaction- Item/01")
    log = _add_log(db_session, item, created_at=datetime(2026, 7, 15, 12, 0, 0))
    db_session.commit()

    response = client.get("/api/inventory/transactions", params={"search": "transactionitem01"})

    assert response.status_code == 200, response.text
    assert [row["log_id"] for row in response.json()] == [str(log.log_id)]


def test_display_groups_search_ignores_spaces_and_separators(client, db_session, make_item):
    item = make_item(name="Display- Group/01")
    other = make_item(name="Other display group")
    log = _add_log(db_session, item, created_at=datetime(2026, 7, 15, 12, 0, 0))
    _add_log(db_session, other, created_at=datetime(2026, 7, 15, 13, 0, 0))
    db_session.commit()

    response = client.get(
        "/api/inventory/transactions/display-groups",
        params={"search": "displaygroup01"},
    )

    assert response.status_code == 200, response.text
    assert [row["log_id"] for group in response.json()["groups"] for row in group["logs"]] == [str(log.log_id)]


def test_reference_summaries_search_ignores_spaces_and_separators(client, db_session, make_item):
    item = make_item(name="Reference- Summary/01")
    other = make_item(name="Other reference summary")
    _add_log(
        db_session,
        item,
        created_at=datetime(2026, 7, 15, 12, 0, 0),
        reference_no="REF-001",
    )
    _add_log(
        db_session,
        other,
        created_at=datetime(2026, 7, 15, 13, 0, 0),
        reference_no="REF-OTHER",
    )
    db_session.commit()

    response = client.get(
        "/api/inventory/transactions/reference-summaries",
        params={"search": "referencesummary01"},
    )

    assert response.status_code == 200, response.text
    assert [row["reference_no"] for row in response.json()] == ["REF-001"]


def test_display_groups_apply_parent_operation_keys_visibility_and_request_date(
    client, db_session, make_item
):
    """표시 묶음도 5종 작업·완료 가시성·최초 요청 시각을 공통으로 사용한다."""
    item = make_item(name="display-group-operation-key-item")
    request_date = datetime(2026, 7, 3, 9, 0, 0)
    visible = _add_batch(db_session, "visible-operation-key")
    visible.sub_type = "warehouse_to_dept"
    visible.submitted_at = request_date
    visible_log = _add_log(
        db_session,
        item,
        created_at=datetime(2026, 6, 30, 23, 0, 0),
        operation_batch_id=visible.batch_id,
        transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
    )
    hidden = _add_batch(db_session, "hidden-operation-key")
    hidden.sub_type = "warehouse_to_dept"
    hidden.status = "submitted"
    hidden.submitted_at = request_date
    hidden_log = _add_log(
        db_session,
        item,
        created_at=datetime(2026, 6, 30, 23, 0, 0),
        operation_batch_id=hidden.batch_id,
        transaction_type=TransactionTypeEnum.TRANSFER_TO_PROD,
    )
    process_log = _add_log(
        db_session,
        item,
        created_at=request_date,
        transaction_type=TransactionTypeEnum.PRODUCE,
    )
    db_session.commit()

    response = client.get(
        "/api/inventory/transactions/display-groups",
        params={
            "operation_keys": "warehouse,process",
            "date_from": "2026-07-03",
            "date_to": "2026-07-03",
        },
    )
    assert response.status_code == 200, response.text
    returned_ids = {
        row["log_id"]
        for group in response.json()["groups"]
        for row in group["logs"]
    }
    assert returned_ids == {str(visible_log.log_id), str(process_log.log_id)}
    assert str(hidden_log.log_id) not in returned_ids


def test_display_groups_cursor_skips_a_batch_that_gains_a_newer_log(client, db_session, make_item):
    item = make_item(name="커서 갱신 품목")
    base = datetime(2026, 7, 15, 12, 0, 0)
    _newer_solos = [
        _add_log(db_session, item, created_at=base - timedelta(minutes=index))
        for index in range(50)
    ]
    batch = _add_batch(db_session, "커서-갱신")
    batch_logs = [
        _add_log(db_session, item, created_at=base - timedelta(minutes=100 + index), operation_batch_id=batch.batch_id)
        for index in range(2)
    ]
    older_solo = _add_log(db_session, item, created_at=base - timedelta(days=1))
    db_session.commit()

    initial = client.get("/api/inventory/transactions/display-groups")
    assert initial.status_code == 200, initial.text
    initial_groups = initial.json()["groups"]
    batch_index = next(
        index for index, group in enumerate(initial_groups)
        if {row["log_id"] for row in group["logs"]} == {str(log.log_id) for log in batch_logs}
    )
    first = client.get("/api/inventory/transactions/display-groups", params={"limit": batch_index + 1})
    assert first.status_code == 200, first.text
    first_body = first.json()
    seen_keys = {group["key"] for group in first_body["groups"]}

    _add_log(db_session, item, created_at=base + timedelta(minutes=1), operation_batch_id=batch.batch_id)
    db_session.commit()

    second = client.get(
        "/api/inventory/transactions/display-groups",
        params={"cursor": first_body["next_cursor"]},
    )

    assert second.status_code == 200, second.text
    assert str(older_solo.log_id) in {row["log_id"] for group in second.json()["groups"] for row in group["logs"]}
    second_keys = {group["key"] for group in second.json()["groups"]}
    assert seen_keys.isdisjoint(second_keys)


def test_display_groups_returns_reference_and_defect_groups_as_complete_logs(client, db_session, make_item):
    item = make_item(name="묶음 규칙 품목")
    base = datetime(2026, 7, 15, 12, 0, 0)
    reference_logs = [
        _add_log(
            db_session,
            item,
            created_at=base - timedelta(minutes=index),
            reference_no="REQ-001",
            shipping_phase="PREPARE",
        )
        for index in range(2)
    ]
    marked = _add_log(
        db_session,
        item,
        created_at=base - timedelta(hours=1),
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        produced_by="작업자",
        department="조립",
        reason_category="파손",
        reason_memo="균열",
    )
    followed = _add_log(
        db_session,
        item,
        created_at=base - timedelta(hours=1) + timedelta(seconds=30),
        transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
        produced_by="작업자",
        department="조립",
        reason_category="파손",
        reason_memo="균열",
    )
    db_session.commit()

    response = client.get("/api/inventory/transactions/display-groups")

    assert response.status_code == 200, response.text
    groups = response.json()["groups"]
    reference_group = next(group for group in groups if group["type"] == "batch")
    assert reference_group["key"] == "REQ-001::PREPARE"
    assert {row["log_id"] for row in reference_group["logs"]} == {
        str(log.log_id) for log in reference_logs
    }
    defect_group = next(group for group in groups if group["type"] == "defect_lifecycle")
    assert [row["log_id"] for row in defect_group["logs"]] == [
        str(marked.log_id),
        str(followed.log_id),
    ]


def test_display_groups_cursor_uses_the_newest_defect_lifecycle_log(client, db_session, make_item):
    item = make_item(name="Defect cursor boundary item")
    base = datetime(2026, 7, 15, 12, 0, 0)
    marked = _add_log(
        db_session,
        item,
        created_at=base,
        transaction_type=TransactionTypeEnum.MARK_DEFECTIVE,
        produced_by="operator",
        department="assembly",
        reason_category="damage",
        reason_memo="scratch",
    )
    between = _add_log(db_session, item, created_at=base + timedelta(seconds=30))
    followed = _add_log(
        db_session,
        item,
        created_at=base + timedelta(seconds=60),
        transaction_type=TransactionTypeEnum.DEFECT_SCRAP,
        produced_by="operator",
        department="assembly",
        reason_category="damage",
        reason_memo="scratch",
    )
    db_session.commit()

    first = client.get("/api/inventory/transactions/display-groups", params={"limit": 1})

    assert first.status_code == 200, first.text
    assert first.json()["groups"][0]["type"] == "defect_lifecycle"
    assert [row["log_id"] for row in first.json()["groups"][0]["logs"]] == [
        str(marked.log_id),
        str(followed.log_id),
    ]

    second = client.get(
        "/api/inventory/transactions/display-groups",
        params={"cursor": first.json()["next_cursor"]},
    )

    assert second.status_code == 200, second.text
    assert str(between.log_id) in {row["log_id"] for group in second.json()["groups"] for row in group["logs"]}
