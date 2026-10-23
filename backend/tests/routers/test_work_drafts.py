"""Shared draft reads authenticate employees and expose a bounded public projection."""
from datetime import datetime, timedelta
from copy import deepcopy
from decimal import Decimal
import uuid

import pytest
from sqlalchemy import event, select

from app.models import (
    Base, Employee, IoBatch, IoBundle, IoLine, StockRequest, StockRequestLine,
    StockRequestStatusEnum, StockRequestTypeEnum,
)
from app.schemas.io import IoDraftUpsert
from app.services.io_draft import save_draft
from app.services.operator_session import issue_session
from tests.services.test_io_draft_reservations import draft_payload, owner  # noqa: F401


@pytest.fixture
def authenticated(db_session, owner):
    token, session = issue_session(db_session, employee=owner, tab_id="shared-drafts")
    db_session.commit()
    return {"X-Operator-Session": token}, session


@pytest.fixture
def drafts(db_session, make_item, owner):
    item = make_item(name="공용 품목", process_type_code="AR", warehouse_qty=Decimal(100))
    item.unit = "BOX"
    body = save_draft(db_session, IoDraftUpsert.model_validate(draft_payload(owner, item)))
    batch = db_session.get(IoBatch, body["batch_id"])
    other = Employee(employee_code="OTHER-DRAFT", name="다른 직원", department="튜브", role="직원", is_active=False)
    db_session.add(other)
    db_session.flush()
    legacy = StockRequest(requester_employee_id=other.employee_id, requester_name=other.name,
        requester_department="튜브", request_type=StockRequestTypeEnum.RAW_RECEIVE,
        status=StockRequestStatusEnum.DRAFT, notes="비공개 메모", reason_memo="비공개 사유",
        operation_batch_id=batch.batch_id)
    legacy.lines = [StockRequestLine(item_id=item.item_id, item_name_snapshot="저장 품목명",
        mes_code_snapshot="SNAP-CODE", quantity=7, from_bucket="none", to_bucket="warehouse", status="draft")]
    db_session.add(legacy)
    batch.notes = "비공개 작업 메모"
    batch.updated_at = datetime(2026, 10, 20, 1)
    legacy.updated_at = datetime(2026, 10, 20, 2)
    db_session.commit()
    return batch, legacy, item


@pytest.mark.parametrize("invalid", ["missing", "garbage", "expired", "revoked", "inactive", "pin_changed"])
def test_both_reads_require_current_operator_session(client, db_session, authenticated, owner, invalid):
    headers, session = authenticated
    if invalid == "missing":
        headers = {}
    elif invalid == "garbage":
        headers = {"X-Operator-Session": "invalid"}
    elif invalid == "expired":
        session.expires_at = datetime.utcnow() - timedelta(seconds=1)
    elif invalid == "revoked":
        session.revoked_at = datetime.utcnow()
    elif invalid == "inactive":
        owner.is_active = False
    else:
        owner.pin_version += 1
    db_session.commit()
    for path in ("/api/work-drafts", f"/api/work-drafts/io/{uuid.uuid4()}"):
        assert client.get(path, headers=headers).status_code == 401


def test_all_staff_drafts_share_pagination_without_deduplication(client, authenticated, drafts):
    batch, legacy, _ = drafts
    headers, _ = authenticated
    first = client.get("/api/work-drafts", headers=headers, params={"limit": 1})
    assert first.status_code == 200, first.text
    assert first.json()["total"] == 2
    assert first.json()["items"][0]["id"] == str(legacy.request_id)
    second = client.get("/api/work-drafts", headers=headers, params={"skip": 1, "limit": 1}).json()
    assert second["items"][0]["id"] == str(batch.batch_id)
    assert second["skip"] == 1 and second["limit"] == 1


@pytest.mark.parametrize("sort,expected_kinds", [
    ("updated_asc", ["io", "stock_request"]),
    ("updated_desc", ["stock_request", "io"]),
])
def test_timestamp_sort_pages_both_kinds_together(client, authenticated, drafts, sort, expected_kinds):
    pages = [client.get("/api/work-drafts", headers=authenticated[0], params={
        "sort": sort, "skip": skip, "limit": 1}) for skip in range(2)]
    assert all(response.status_code == 200 for response in pages)
    assert all(response.json()["total"] == 2 for response in pages)
    assert [response.json()["items"][0]["kind"] for response in pages] == expected_kinds


def test_department_sort_orders_all_departments_before_paging_and_filters(client, db_session, authenticated, owner):
    departments = ["창고", "튜브", "고압", "진공", "튜닝", "조립", "출하", "기타가", "기타나"]
    works = []
    for index, department in enumerate(reversed(departments)):
        values = dict(requester_employee_id=owner.employee_id, requester_name="sort-target",
            requester_department=department, status="draft", updated_at=datetime(2026, 10, 20, index % 3))
        work = (IoBatch(work_type="warehouse_io", sub_type="warehouse_to_dept", **values)
            if index % 2 else StockRequest(request_type="raw_receive", **values))
        db_session.add(work)
        works.append(work)
    newer_warehouse = StockRequest(requester_employee_id=owner.employee_id, requester_name="sort-target",
        requester_department="창고", request_type="raw_receive", status="draft", updated_at=datetime(2026, 10, 21))
    excluded = StockRequest(requester_employee_id=owner.employee_id, requester_name="excluded",
        requester_department="창고", request_type="raw_receive", status="draft", updated_at=datetime(2026, 10, 22))
    db_session.add_all([newer_warehouse, excluded])
    db_session.commit()
    responses = [client.get("/api/work-drafts", headers=authenticated[0], params={
        "sort": "department", "search": "sort-target", "skip": skip, "limit": 3})
        for skip in range(0, 10, 3)]
    assert all(response.status_code == 200 for response in responses)
    assert all(response.json()["total"] == 10 for response in responses)
    rows = [row for response in responses for row in response.json()["items"]]
    assert [row["requester_department"] for row in rows] == ["창고", *departments]
    assert [row["id"] for row in rows] == [str(newer_warehouse.request_id), *[
        str(work.batch_id if isinstance(work, IoBatch) else work.request_id) for work in reversed(works)]]
    filtered = client.get("/api/work-drafts", headers=authenticated[0], params={
        "sort": "department", "search": "sort-target", "requester_department": "창고", "skip": 1, "limit": 1})
    assert filtered.status_code == 200
    assert filtered.json()["total"] == 2
    assert filtered.json()["items"][0]["id"] == rows[1]["id"]


@pytest.mark.parametrize("search,expected_kind", [
    ("다른 직원", "stock_request"), ("튜브", "stock_request"), ("저장 품목명", "stock_request"),
    ("SNAP-CODE", "stock_request"), ("원자재 입고", "stock_request"),
    ("창고 → 부서", "io"), ("공용 품목", "io"),
])
def test_searches_both_kinds_before_pagination(client, authenticated, drafts, search, expected_kind):
    response = client.get("/api/work-drafts", headers=authenticated[0], params={"search": search, "limit": 1})
    assert response.status_code == 200, response.text
    assert response.json()["total"] == 1
    assert response.json()["items"][0]["kind"] == expected_kind


def test_department_and_employee_filters_apply_to_both_kinds(client, authenticated, drafts):
    batch, legacy, _ = drafts
    for work, kind, work_id in ((batch, "io", batch.batch_id), (legacy, "stock_request", legacy.request_id)):
        response = client.get("/api/work-drafts", headers=authenticated[0], params={
            "requester_department": work.requester_department, "requester_employee_id": str(work.requester_employee_id)})
        assert response.status_code == 200, response.text
        assert [(row["kind"], row["id"]) for row in response.json()["items"]] == [(kind, str(work_id))]


def test_public_projection_preserves_units_and_legacy_unknown_reservation(client, authenticated, drafts):
    batch, legacy, item = drafts
    summary_fields = {"kind", "id", "requester_employee_id", "requester_name", "requester_department",
        "requester_active", "worker_names", "work_type", "sub_type", "request_type", "targets", "movement_summary", "history_operation", "notes", "created_at", "updated_at", "stocktake_pause"}
    detail_fields = summary_fields | {"reservation_status", "reservation_issue", "reserved_inputs", "expected_effects", "forecast_issue", "shipping_summary"}
    rows = client.get("/api/work-drafts", headers=authenticated[0]).json()["items"]
    assert all(set(row) == summary_fields for row in rows)
    assert {row["id"]: row["notes"] for row in rows} == {
        str(batch.batch_id): batch.notes, str(legacy.request_id): legacy.notes,
    }
    for kind, work_id in (("io", batch.batch_id), ("stock_request", legacy.request_id)):
        response = client.get(f"/api/work-drafts/{kind}/{work_id}", headers=authenticated[0])
        assert response.status_code == 200, response.text
        body = response.json()
        assert set(body) == detail_fields
        assert body["created_at"].endswith("+00:00")
        assert body["targets"][0]["unit"] == "BOX"
        assert body["notes"] == (batch.notes if kind == "io" else legacy.notes)
        assert "reason_memo" not in body
        assert "비공개 사유" not in response.text
        if kind == "io":
            assert body["history_operation"] == {"transaction_type": "TRANSFER_TO_PROD", "department": "조립"}
            assert body["movement_summary"] == {"increase": 0, "decrease": 0, "move": 1}
            assert body["reservation_status"] == "reserved"
            assert body["reserved_inputs"][0]["quantity"] == 3
            assert body["request_type"] is None
        else:
            assert body["history_operation"] == {"transaction_type": "RECEIVE", "department": None}
            assert body["movement_summary"] is None
            assert body["requester_active"] is False
            assert body["work_type"] is body["sub_type"] is None
            assert body["request_type"] == "raw_receive"
            assert body["targets"] == [{"item_id": str(item.item_id), "item_name": "저장 품목명",
                "mes_code": "SNAP-CODE", "unit": "BOX", "quantity": 7}]
            assert all(body[name] is None for name in detail_fields - summary_fields)


def test_movement_summary_counts_saved_effects_without_quantities_or_private_payload(client, db_session, authenticated, drafts):
    batch, _, _ = drafts
    template = batch.effective_plan["effects"][0]
    effects = []
    for kind in ("in", "in", "out", "move"):
        effect = deepcopy(template)
        effect.update(effect_id=str(uuid.uuid4()), operation_line_id=str(uuid.uuid4()), kind=kind, quantity=37)
        if kind == "in":
            effect["from"] = None
        elif kind == "out":
            effect["to"] = None
        effects.append(effect)
    batch.effective_plan = {**batch.effective_plan, "effects": effects, "private": "PRIVATE-PLAN"}
    batch.reservation_status = "inactive"
    db_session.commit()
    for path in ("/api/work-drafts", f"/api/work-drafts/io/{batch.batch_id}"):
        response = client.get(path, headers=authenticated[0])
        assert response.status_code == 200, response.text
        body = response.json()
        row = next(row for row in body["items"] if row["kind"] == "io") if "items" in body else body
        assert row["movement_summary"] == {"increase": 2, "decrease": 1, "move": 1}
        assert "effective_plan" not in row
        assert "PRIVATE-PLAN" not in response.text


@pytest.mark.parametrize("plan,expected", [
    (None, None),
    ({}, None),
    ({"version": 1, "fingerprint": "broken", "effects": [{"kind": "in"}]}, None),
    ({"version": 1, "fingerprint": "empty", "effects": []}, {"increase": 0, "decrease": 0, "move": 0}),
])
def test_movement_summary_distinguishes_unknown_from_valid_empty_plan(client, db_session, authenticated, drafts, plan, expected):
    batch, _, _ = drafts
    batch.effective_plan = plan
    db_session.commit()
    for path in ("/api/work-drafts", f"/api/work-drafts/io/{batch.batch_id}"):
        response = client.get(path, headers=authenticated[0])
        assert response.status_code == 200, response.text
        body = response.json()
        row = next(row for row in body["items"] if row["kind"] == "io") if "items" in body else body
        assert row["movement_summary"] == expected


@pytest.mark.parametrize("status", ["submitted", "completed", "cancelled"])
def test_changed_status_disappears_and_returns_404(client, db_session, authenticated, drafts, status):
    batch, legacy, _ = drafts
    batch.status = status
    legacy.status = StockRequestStatusEnum(status)
    db_session.commit()
    assert client.get("/api/work-drafts", headers=authenticated[0]).json()["total"] == 0
    for kind, work_id in (("io", batch.batch_id), ("stock_request", legacy.request_id), ("io", uuid.uuid4())):
        assert client.get(f"/api/work-drafts/{kind}/{work_id}", headers=authenticated[0]).status_code == 404


@pytest.mark.parametrize("sort", ["updated_desc", "updated_asc", "department"])
def test_ties_sort_by_kind_then_id_and_get_never_writes(client, db_session, authenticated, drafts, sort):
    batch, legacy, _ = drafts
    legacy.updated_at = batch.updated_at
    legacy.requester_department = batch.requester_department
    db_session.commit()
    def snapshot():
        return {table.name: db_session.execute(select(table)).all() for table in Base.metadata.sorted_tables}
    before = snapshot()
    rows = client.get("/api/work-drafts", headers=authenticated[0], params={"sort": sort}).json()["items"]
    assert [row["kind"] for row in rows] == ["io", "stock_request"]
    for row in rows:
        assert client.get(f"/api/work-drafts/{row['kind']}/{row['id']}", headers=authenticated[0]).status_code == 200
    assert snapshot() == before


def test_empty_and_validation_contract(client, authenticated):
    response = client.get("/api/work-drafts", headers=authenticated[0])
    assert response.status_code == 200, response.text
    assert response.json() == {"items": [], "total": 0, "skip": 0, "limit": 30}
    for params in ({"skip": -1}, {"limit": 0}, {"limit": 101}, {"requester_employee_id": "bad"}, {"sort": "invalid"}):
        assert client.get("/api/work-drafts", headers=authenticated[0], params=params).status_code == 422


def test_list_loads_only_page_graphs_with_fixed_query_count(client, db_session, authenticated, drafts):
    batch, legacy, item = drafts
    for index in range(20):
        now = datetime(2026, 10, 21, 1) + timedelta(minutes=index)
        extra = IoBatch(work_type="warehouse_io", sub_type="warehouse_to_dept", status="draft",
            requester_employee_id=batch.requester_employee_id, requester_name="bulk-io",
            requester_department=batch.requester_department, updated_at=now, effective_plan=deepcopy(batch.effective_plan))
        extra.bundles = [IoBundle(source_kind="direct_item", source_item_id=item.item_id,
            title_snapshot="bulk", quantity=1, lines=[IoLine(item_id=item.item_id,
                item_name_snapshot="bulk", quantity=1, unit="BOX", direction="move",
                from_bucket="warehouse", to_bucket="production", to_department="조립", origin="direct")])]
        db_session.add(extra)
        request = StockRequest(requester_employee_id=legacy.requester_employee_id, requester_name="bulk",
            requester_department="튜브", request_type="raw_receive", status="draft", updated_at=now)
        request.lines = [StockRequestLine(item_id=item.item_id, item_name_snapshot="bulk", quantity=1,
            from_bucket="none", to_bucket="warehouse", status="draft")]
        db_session.add(request)
    db_session.commit()
    statements, loaded = [], []
    def record(connection, cursor, statement, parameters, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            statements.append(statement)
    def record_loaded(session, instance):
        loaded.append(instance)
    query_counts = []
    for limit in (2, 20):
        db_session.expunge_all()
        statements.clear()
        loaded.clear()
        event.listen(db_session.bind, "before_cursor_execute", record)
        event.listen(db_session, "loaded_as_persistent", record_loaded)
        try:
            response = client.get("/api/work-drafts", headers=authenticated[0], params={"limit": limit})
        finally:
            event.remove(db_session.bind, "before_cursor_execute", record)
            event.remove(db_session, "loaded_as_persistent", record_loaded)
        assert response.status_code == 200, response.text
        assert response.json()["total"] == 42
        assert len([row for row in loaded if isinstance(row, (IoBatch, StockRequest))]) == limit
        assert len([row for row in loaded if isinstance(row, (IoBundle, IoLine, StockRequestLine))]) == limit // 2 * 3
        query_counts.append(len(statements))
        plan_reads = [statement for statement in statements if "io_batches.effective_plan" in statement]
        assert len(plan_reads) == 1
        assert "io_batches.batch_id IN" in plan_reads[0]
        assert all(row["movement_summary"] == {"increase": 0, "decrease": 0, "move": 1}
            for row in response.json()["items"] if row["kind"] == "io")
    # One additional batched pause lookup stays independent of page size.
    assert query_counts[0] == query_counts[1] == 11


@pytest.mark.parametrize("sort", ["updated_desc", "updated_asc", "department"])
def test_same_kind_ties_sort_by_id_and_shipping_link_is_preserved(client, db_session, authenticated, drafts, sort):
    batch, legacy, item = drafts
    other = StockRequest(request_id=uuid.UUID(int=1), requester_employee_id=legacy.requester_employee_id,
        requester_name="second", requester_department="튜브", request_type="package_out", status="draft",
        updated_at=legacy.updated_at)
    other.lines = [StockRequestLine(item_id=item.item_id, item_name_snapshot="출하 부품", quantity=2,
        from_bucket="warehouse", to_bucket="none", status="draft")]
    db_session.add(other)
    db_session.commit()
    rows = client.get("/api/work-drafts", headers=authenticated[0], params={"sort": sort}).json()["items"]
    stock_rows = [row for row in rows if row["kind"] == "stock_request"]
    assert [row["id"] for row in stock_rows] == [str(other.request_id), str(legacy.request_id)]
    assert stock_rows[0]["request_type"] == "package_out"


def test_search_treats_percent_as_literal_and_supports_mes_code(client, db_session, authenticated, drafts):
    batch, legacy, item = drafts
    legacy.lines[0].item_name_snapshot = "부품 100%"
    db_session.commit()
    literal = client.get("/api/work-drafts", headers=authenticated[0], params={"search": "%"}).json()
    assert literal["total"] == 1 and literal["items"][0]["kind"] == "stock_request"
    coded = client.get("/api/work-drafts", headers=authenticated[0], params={"search": item.mes_code}).json()
    assert coded["total"] == 1 and coded["items"][0]["kind"] == "io"


def test_legacy_targets_include_every_saved_line(client, db_session, authenticated, drafts, make_item):
    _, legacy, _ = drafts
    item = make_item(name="현재 이름")
    item.unit = "SET"
    legacy.lines.append(StockRequestLine(item_id=item.item_id, item_name_snapshot="두 번째 저장 이름",
        mes_code_snapshot="SECOND-SNAPSHOT", quantity=11, from_bucket="none", to_bucket="warehouse", status="draft"))
    db_session.commit()
    for path in ("/api/work-drafts", f"/api/work-drafts/stock_request/{legacy.request_id}"):
        response = client.get(path, headers=authenticated[0])
        assert response.status_code == 200, response.text
        body = response.json()
        row = next(row for row in body["items"] if row["kind"] == "stock_request") if "items" in body else body
        assert len(row["targets"]) == 2
        assert row["targets"][1] == {"item_id": str(item.item_id), "item_name": "두 번째 저장 이름",
            "mes_code": "SECOND-SNAPSHOT", "unit": "SET", "quantity": 11}


def test_openapi_exposes_only_shared_draft_filters(client):
    from app.main import app
    operation = app.openapi()["paths"]["/api/work-drafts"]["get"]
    assert {parameter["name"] for parameter in operation["parameters"] if parameter["in"] == "query"} == {
        "search", "requester_department", "requester_employee_id", "sort", "skip", "limit"}
    assert any(parameter["name"] == "X-Operator-Session" for parameter in operation["parameters"])


def test_request_type_search_casts_native_enum_for_postgresql(db_session, drafts):
    """SQLite text enums must not hide PostgreSQL's unsupported enum ILIKE operator."""
    from sqlalchemy.dialects import postgresql
    from app.services.work_drafts import list_work_drafts

    compiled = []
    def record_statement(state):
        if state.is_select:
            compiled.append(str(state.statement.compile(dialect=postgresql.dialect())))
    event.listen(db_session, "do_orm_execute", record_statement)
    try:
        result = list_work_drafts(db_session, search="raw_receive")
    finally:
        event.remove(db_session, "do_orm_execute", record_statement)
    assert result["total"] == 1
    assert StockRequest.__table__.c.request_type.type.native_enum is True
    search_statements = [statement for statement in compiled if "UNION ALL" in statement]
    assert len(search_statements) == 2  # count and page must use the same portable filter
    assert all("CAST(stock_requests.request_type AS VARCHAR) ILIKE" in statement for statement in search_statements)
    assert all("stock_requests.request_type ILIKE" not in statement for statement in search_statements)


def test_effect_order_matches_completed_history_without_mutating_saved_plan(
    client, db_session, authenticated, drafts, owner, make_location,
):
    from app.models import DepartmentEnum
    from app.services.io_dispatch import _apply_line
    from app.services.io_effective_plan import _effect

    batch, _, item = drafts
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal(20))
    bundle = batch.bundles[0]
    bundle.lines = [IoLine(line_id=uuid.UUID(int=index + 1), item_id=item.item_id,
        item_name_snapshot=item.item_name, unit="BOX", quantity=index + 1, direction=direction,
        from_bucket=source, from_department="조립" if source == "production" else None,
        to_bucket=target, to_department="조립" if target == "production" else None,
        included=True, origin="direct", created_at=datetime(2026, 10, 20, index))
        for index, (direction, source, target) in enumerate([
            ("out", "warehouse", "none"), ("in", "none", "production"),
            ("adjust", "warehouse", "none"), ("out", "production", "none"),
        ])]
    db_session.flush()
    effects = [_effect(line) for line in bundle.lines]
    unknown = [{**effects[0], "effect_id": str(uuid.uuid4()), "operation_line_id": str(uuid.uuid4())}
               for _ in range(2)]
    batch.effective_plan = {**batch.effective_plan, "effects": [unknown[0], *effects, unknown[1]]}
    db_session.commit()
    before = deepcopy(batch.effective_plan)
    detail = client.get(f"/api/work-drafts/io/{batch.batch_id}", headers=authenticated[0]).json()
    projected = detail["expected_effects"]
    assert detail["history_operation"] is None
    assert [effect["operation_line_id"] for effect in projected[-2:]] == [effect["operation_line_id"] for effect in unknown]
    assert batch.effective_plan == before
    for line in sorted(bundle.lines, key=lambda line: 0 if line.direction == "out" else 1):
        _apply_line(db_session, batch=batch, line=line, requester=owner)
        db_session.flush()
    batch.status = "completed"
    db_session.commit()
    history = client.get("/api/inventory/transactions", params={"operation_batch_id": str(batch.batch_id)})
    assert history.status_code == 200, history.text
    assert [effect["operation_line_id"] for effect in projected[:-2]] == [log["operation_line_id"] for log in history.json()]
    assert batch.effective_plan == before


@pytest.mark.parametrize("sub_type,direction,source,target,destination,expected_type,expected_department", [
    ("receive_supplier", "in", "none", "warehouse", None, "RECEIVE", None),
    ("tube_receive_supplier", "in", "none", "production", "튜브", "RECEIVE", "튜브"),
    ("outbound_supplier", "out", "warehouse", "none", None, "MATERIAL_OUT", None),
    ("tube_outbound_supplier", "out", "production", "none", None, "MATERIAL_OUT", "조립"),
    ("internal_use_out", "out", "warehouse", "none", "연구", "INTERNAL_USE", "연구"),
    ("warehouse_adjust_in", "adjust", "none", "warehouse", None, "ADJUST", "창고"),
    ("warehouse_adjust_out", "adjust", "warehouse", "none", None, "ADJUST", "창고"),
    ("adjust_in", "in", "none", "production", "조립", "PRODUCE", "조립"),
    ("adjust_out", "out", "production", "none", None, "BACKFLUSH", "조립"),
    ("warehouse_to_dept", "move", "warehouse", "production", "조립", "TRANSFER_TO_PROD", "조립"),
    ("dept_to_warehouse", "move", "production", "warehouse", None, "TRANSFER_TO_WH", "조립"),
    ("dept_transfer", "move", "production", "production", "튜브", "TRANSFER_DEPT", "조립"),
    ("defect_quarantine", "defective", "warehouse", "defective", "조립", "MARK_DEFECTIVE", "조립"),
])
def test_history_operation_matches_actual_execution_log(
    client, db_session, authenticated, drafts, owner, make_location,
    sub_type, direction, source, target, destination, expected_type, expected_department,
):
    from app.models import DepartmentEnum
    from app.services.io_dispatch import _apply_line
    from app.services.io_effective_plan import _effect

    batch, _, item = drafts
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal(20))
    batch.sub_type = sub_type
    line = batch.bundles[0].lines[0]
    line.direction, line.from_bucket, line.to_bucket = direction, source, target
    line.from_department = "조립" if source == "production" else None
    line.to_department = destination
    batch.effective_plan = {**batch.effective_plan, "effects": [_effect(line)]}
    db_session.commit()
    summary = client.get(f"/api/work-drafts/io/{batch.batch_id}", headers=authenticated[0]).json()
    expected = {"transaction_type": expected_type, "department": expected_department}
    assert summary["history_operation"] == expected
    _apply_line(db_session, batch=batch, line=line, requester=owner)
    batch.status = "completed"
    db_session.commit()
    history = client.get("/api/inventory/transactions", params={"operation_batch_id": str(batch.batch_id)})
    assert history.status_code == 200, history.text
    assert {key: history.json()[0][key] for key in expected} == expected


@pytest.mark.parametrize("sub_type,directions,expected", [
    ("produce", ["in", "out"], "PRODUCE"),
    ("produce", ["in"], "ADJUST"),
    ("produce", ["out"], "ADJUST"),
    ("disassemble", ["in", "out"], "DISASSEMBLE"),
    ("disassemble", ["in"], "ADJUST"),
    ("disassemble", ["out"], "ADJUST"),
])
def test_process_history_operation_uses_actual_saved_effect_composition(
    client, db_session, authenticated, drafts, sub_type, directions, expected,
):
    from app.services.io_effective_plan import _effect

    batch, _, item = drafts
    batch.sub_type, batch.work_type = sub_type, "process"
    bundle = batch.bundles[0]
    bundle.lines = [IoLine(item_id=item.item_id, item_name_snapshot=item.item_name, unit="BOX",
        quantity=1, direction=direction, from_bucket="production" if direction == "out" else "none",
        from_department="조립" if direction == "out" else None,
        to_bucket="production" if direction == "in" else "none",
        to_department="조립" if direction == "in" else None,
        included=True, origin="direct") for direction in directions]
    db_session.flush()
    batch.effective_plan = {**batch.effective_plan, "effects": [_effect(line) for line in bundle.lines]}
    db_session.commit()
    for path in ("/api/work-drafts", f"/api/work-drafts/io/{batch.batch_id}"):
        response = client.get(path, headers=authenticated[0])
        assert response.status_code == 200, response.text
        body = response.json()
        summary = next(row for row in body["items"] if row["kind"] == "io") if "items" in body else body
        assert summary["history_operation"]["transaction_type"] == expected


def test_effect_snapshot_is_authoritative_over_saved_inclusion_flag(client, db_session, authenticated, drafts):
    batch, _, _ = drafts
    batch.bundles[0].lines[0].included = False
    db_session.commit()
    response = client.get(f"/api/work-drafts/io/{batch.batch_id}", headers=authenticated[0])
    assert response.status_code == 200, response.text
    assert response.json()["history_operation"] == {"transaction_type": "TRANSFER_TO_PROD", "department": "조립"}


@pytest.mark.parametrize("request_type,source,target,destination,expected_type,expected_department", [
    ("raw_receive", "none", "warehouse", None, "RECEIVE", None),
    ("raw_ship", "warehouse", "none", None, "SHIP", None),
    ("warehouse_to_dept", "warehouse", "production", "조립", "TRANSFER_TO_PROD", None),
    ("dept_to_warehouse", "production", "warehouse", None, "TRANSFER_TO_WH", "조립"),
    ("dept_internal", "production", "production", "튜브", "TRANSFER_DEPT", "조립"),
    ("internal_use", "warehouse", "none", "연구", "INTERNAL_USE", "연구"),
    ("mark_defective_wh", "warehouse", "defective", "조립", "MARK_DEFECTIVE", "조립"),
])
def test_legacy_history_operation_matches_completed_request(
    client, db_session, authenticated, drafts, owner, make_location,
    request_type, source, target, destination, expected_type, expected_department,
):
    from app.models import DepartmentEnum
    from app.services.sr_execution import _execute_line

    _, request, item = drafts
    make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal(20))
    request.request_type = StockRequestTypeEnum(request_type)
    request.request_code = "LEGACY-HISTORY"
    request.operation_batch_id = None
    line = request.lines[0]
    line.from_bucket, line.to_bucket = source, target
    line.from_department = "조립" if source == "production" else None
    line.to_department = destination
    db_session.commit()
    expected = {"transaction_type": expected_type, "department": expected_department}
    for path in ("/api/work-drafts", f"/api/work-drafts/stock_request/{request.request_id}"):
        response = client.get(path, headers=authenticated[0])
        assert response.status_code == 200, response.text
        body = response.json()
        summary = next(row for row in body["items"] if row["kind"] == "stock_request") if "items" in body else body
        assert summary["history_operation"] == expected
    _execute_line(db_session, request, line, approver=owner, is_approval=True)
    request.status = "completed"
    db_session.commit()
    history = client.get("/api/inventory/transactions", params={"reference_no": request.request_code})
    assert history.status_code == 200, history.text
    assert {key: history.json()[0][key] for key in expected} == expected


def test_legacy_unknown_adjustment_stays_unclassified(client, db_session, authenticated, drafts):
    _, request, _ = drafts
    request.request_type = StockRequestTypeEnum.MANUAL_ADJUSTMENT
    db_session.commit()
    response = client.get(f"/api/work-drafts/stock_request/{request.request_id}", headers=authenticated[0])
    assert response.status_code == 200, response.text
    assert response.json()["history_operation"] is None


@pytest.mark.parametrize("sub_type,raw_child_direction,manual_direction,transaction_type", [
    ("produce", "out", "in", "PRODUCE"),
    ("disassemble", "in", "out", "BACKFLUSH"),
])
def test_custom_process_projection_matches_finalized_dispatcher_routes(
    client, db_session, authenticated, drafts, owner, make_item, make_location, make_bom,
    sub_type, raw_child_direction, manual_direction, transaction_type,
):
    from app.models import DepartmentEnum
    from app.services import io_dispatch
    from app.services.io_effective_plan import _clone_batch, build_effective_plan
    from tests.services.test_io_dispatch import _issue_bom_auto_token

    batch, _, child = drafts
    parent = make_item(name="custom-parent", process_type_code="AF")
    manual = make_item(name="custom-manual", process_type_code="AR")
    make_bom(parent.item_id, child.item_id, Decimal(1))
    for item in (parent, child, manual):
        make_location(item.item_id, department=DepartmentEnum.ASSEMBLY, quantity=Decimal(20))
    batch.work_type, batch.sub_type = "process", sub_type
    bundle = batch.bundles[0]
    bundle.source_kind, bundle.source_item_id = "bom_parent", parent.item_id
    bundle.quantity = 1
    specs = [(parent, manual_direction, "direct", 1), (child, raw_child_direction, "bom_auto", 2)]
    bundle.lines = [IoLine(item_id=item.item_id, item_name_snapshot=item.item_name, unit="EA",
        quantity=quantity, direction=direction, from_bucket="production" if direction == "out" else "none",
        from_department="조립" if direction == "out" else None,
        to_bucket="production" if direction == "in" else "none",
        to_department="조립" if direction == "in" else None, included=True, origin=origin,
        created_at=datetime(2026, 10, 20, index))
        for index, (item, direction, origin, quantity) in enumerate(specs)]
    manual_bundle = IoBundle(source_kind="manual", source_item_id=manual.item_id,
        title_snapshot=manual.item_name, quantity=1, created_at=datetime(2026, 10, 19), lines=[
            IoLine(item_id=manual.item_id, item_name_snapshot=manual.item_name, unit="EA", quantity=1,
                direction="adjust", from_bucket="production" if manual_direction == "out" else "none",
                from_department="조립" if manual_direction == "out" else None,
                to_bucket="production" if manual_direction == "in" else "none",
                to_department="조립" if manual_direction == "in" else None, included=True, origin="manual")])
    bundle.created_at = datetime(2026, 10, 20)
    batch.bundles = [manual_bundle, bundle]
    db_session.flush()
    _issue_bom_auto_token(db_session, batch, bundle.lines[-1])
    batch.effective_plan = build_effective_plan(db_session, batch)
    db_session.commit()
    saved_plan = deepcopy(batch.effective_plan)
    assert {effect["kind"] for effect in saved_plan["effects"]} == {manual_direction}
    saved_routes = [(line.line_id, line.direction, line.from_bucket, line.to_bucket) for line in bundle.lines]
    detail = client.get(f"/api/work-drafts/io/{batch.batch_id}", headers=authenticated[0]).json()
    assert detail["history_operation"]["transaction_type"] == "ADJUST"
    clone = _clone_batch(batch)
    io_dispatch.prepare_effective_lines(db_session, clone)
    custom_ids = io_dispatch._custom_process_bom_bundle_ids(db_session, clone)
    io_dispatch.finalize_effective_lines(db_session, clone, custom_ids)
    lines = io_dispatch._included_lines(clone)
    assert all(line.direction == ("adjust" if line.origin == "manual" else manual_direction) for line in lines)
    for line in sorted(lines, key=lambda line: 0 if line.direction == "out" else 1):
        io_dispatch._apply_line(db_session, batch=batch, line=line, requester=owner)
        db_session.flush()
    batch.status = "completed"
    db_session.commit()
    history = client.get("/api/inventory/transactions", params={"operation_batch_id": str(batch.batch_id)})
    assert history.status_code == 200, history.text
    assert {log["transaction_type"] for log in history.json()} == {transaction_type, "ADJUST"}
    assert [effect["operation_line_id"] for effect in detail["expected_effects"]] == [log["operation_line_id"] for log in history.json()]
    assert saved_plan == batch.effective_plan
    assert saved_routes == [(line.line_id, line.direction, line.from_bucket, line.to_bucket) for line in bundle.lines]
