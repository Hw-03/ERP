"""품목 조회의 관리 분류별 재고 계약을 실제 격리 원장으로 검증한다."""

from decimal import Decimal

from sqlalchemy import event

from app.models import DefectQuarantineRecord, DepartmentEnum, LocationStatusEnum


def test_items_breakdown_groups_remaining_stock_and_keeps_legacy_locations(
    client, db_session, make_item, make_location,
):
    item = make_item(warehouse_qty=Decimal("5"))
    make_location(item.item_id, department=DepartmentEnum.TUBE, quantity=Decimal("8"))
    for department, quantity in [(DepartmentEnum.TUBE, 9), (DepartmentEnum.ASSEMBLY, 4), (DepartmentEnum.AS, 3)]:
        make_location(item.item_id, department=department, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal(quantity))
    for department, category, original, remaining in [
        ("튜브", "DEFECT", 7, 2),
        ("튜브", "B_GRADE", 3, 3),
        ("튜브", "B_GRADE", 2, 1),
        ("튜브", "OBSOLETE", 3, 3),
        ("조립", "B_GRADE", 4, 4),
        ("AS", "OBSOLETE", 6, 0),
    ]:
        db_session.add(DefectQuarantineRecord(
            item_id=item.item_id, department=department,
            management_category=category,
            original_quantity=original, remaining_quantity=remaining,
        ))
    db_session.flush()

    detail = client.get(f"/api/items/{item.item_id}")
    listing = client.get("/api/items")
    assert detail.status_code == listing.status_code == 200
    detail_data = detail.json()
    listed = next(row for row in listing.json() if row["item_id"] == str(item.item_id))
    expected = {
        ("튜브", "DEFECT"): 2,
        ("튜브", "B_GRADE"): 4,
        ("튜브", "OBSOLETE"): 3,
        ("조립", "B_GRADE"): 4,
        ("AS", "DEFECT"): 3,
    }
    for data in [detail_data, listed]:
        actual = {(row["department"], row["management_category"]): row["quantity"] for row in data["defective_breakdown"]}
        assert actual == expected
        assert sum(actual.values()) == data["defective_total"] == 16
        assert data["quantity"] == 29
        assert data["available_quantity"] == 13


def test_items_without_quarantined_stock_return_empty_breakdown(client, make_item):
    item = make_item(warehouse_qty=Decimal("4"))
    response = client.get(f"/api/items/{item.item_id}")
    assert response.status_code == 200
    assert response.json()["defective_breakdown"] == []


def test_items_show_current_management_category_after_reclassification(
    client, db_session, make_item, make_location,
):
    item = make_item()
    make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("3"))
    record = DefectQuarantineRecord(
        item_id=item.item_id, department="조립", management_category="B_GRADE",
        original_quantity=5, remaining_quantity=3,
    )
    db_session.add(record)
    db_session.flush()
    before = client.get(f"/api/items/{item.item_id}").json()
    assert before["defective_breakdown"] == [{"department": "조립", "management_category": "B_GRADE", "quantity": 3}]
    record.management_category = "OBSOLETE"
    db_session.flush()
    after = client.get(f"/api/items/{item.item_id}").json()
    assert after["defective_breakdown"] == [{"department": "조립", "management_category": "OBSOLETE", "quantity": 3}]
    assert before["quantity"] == after["quantity"] == 3
    assert before["available_quantity"] == after["available_quantity"] == 0


def test_items_fetch_category_totals_once_for_multiple_items(
    client, db_session, make_item, make_location,
):
    items = [make_item() for _ in range(3)]
    for item in items:
        make_location(item.item_id, status=LocationStatusEnum.DEFECTIVE, quantity=Decimal("2"))
        db_session.add(DefectQuarantineRecord(
            item_id=item.item_id, department="조립", management_category="B_GRADE",
            original_quantity=2, remaining_quantity=2,
        ))
    db_session.flush()
    queries = []

    def capture_query(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT") and "defect_quarantine_records" in statement:
            queries.append(statement)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", capture_query)
    try:
        response = client.get("/api/items")
    finally:
        event.remove(bind, "before_cursor_execute", capture_query)
    assert response.status_code == 200
    assert len(queries) == 1
    assert all(row["defective_breakdown"] == [{"department": "조립", "management_category": "B_GRADE", "quantity": 2}] for row in response.json())
