"""StockRequest 워크플로 테스트.

시나리오:
1. wh-to-dept 요청 생성 → pending 증가, warehouse_qty 불변, status=RESERVED
2. 가용 부족 → 422 응답, 점유 미생성
3. 다라인 중 1개 부족 → 전체 롤백
4. 승인 시 pending 차감 + 실재고 이동 + TransactionLog 기록
5. 반려 시 pending 원복
6. 본인 취소
7. DEPT_INTERNAL 즉시 처리 (자동 COMPLETED)
8. warehouse_role=none 직원 승인 시도 → 403
   추가: PIN 오류 / FAILED_APPROVAL / 완료 후 재처리 거부
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import (
    DepartmentEnum,
    Employee,
    EmployeeLevelEnum,
    Inventory,
    InventoryLocation,
    LocationStatusEnum,
    StockRequest,
    StockRequestLine,
    StockRequestStatusEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin


# ---------------------------------------------------------------------------
# 직원 헬퍼
# ---------------------------------------------------------------------------


def _make_employee(
    db_session,
    *,
    code: str,
    name: str,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
    pin: str = "0000",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/사원",
        department=department,
        level=level,
        warehouse_role=warehouse_role,
        display_order=0,
        is_active="true",
        pin_hash=hash_pin(pin) if pin != "0000" else DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _create_request_via_api(
    client,
    *,
    requester_id: str,
    request_type: str,
    lines: list[dict],
    notes: str | None = None,
) -> dict:
    payload = {
        "requester_employee_id": requester_id,
        "request_type": request_type,
        "lines": lines,
    }
    if notes is not None:
        payload["notes"] = notes
    res = client.post("/api/stock-requests", json=payload)
    return {"status_code": res.status_code, "body": res.json()}


# ---------------------------------------------------------------------------
# 시나리오 1: 창고→부서 요청 생성 → 점유만 발생
# ---------------------------------------------------------------------------


def test_warehouse_to_dept_request_reserves_pending(db_session, client, make_item):
    item = make_item(name="P001", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="W01", name="요청자A")
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "3",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    assert out["status_code"] == 201, out["body"]
    assert out["body"]["status"] == "reserved"
    assert out["body"]["requires_warehouse_approval"] is True
    assert out["body"]["request_code"].startswith("SR-")

    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("10")
    assert inv.pending_quantity == Decimal("3")
    # TransactionLog 는 아직 생성되지 않아야 함 (승인 전이므로)
    assert db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).count() == 0


# ---------------------------------------------------------------------------
# 시나리오 2: 가용 부족 → 422, 점유 미생성
# ---------------------------------------------------------------------------


def test_request_fails_when_not_enough_available(db_session, client, make_item):
    item = make_item(name="P002", warehouse_qty=Decimal("10"), pending=Decimal("8"))
    requester = _make_employee(db_session, code="W02", name="요청자B")
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "5",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    assert out["status_code"] == 422
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == Decimal("8")  # 변동 없음
    assert db_session.query(StockRequest).count() == 0


# ---------------------------------------------------------------------------
# 시나리오 3: 다라인 중 1개 부족 → 전체 롤백
# ---------------------------------------------------------------------------


def test_multiline_request_rolls_back_when_one_line_short(db_session, client, make_item):
    item_a = make_item(name="P003A", warehouse_qty=Decimal("5"))
    item_b = make_item(name="P003B", warehouse_qty=Decimal("1"))  # 부족
    requester = _make_employee(db_session, code="W03", name="요청자C")
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item_a.item_id),
                "quantity": "3",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            },
            {
                "item_id": str(item_b.item_id),
                "quantity": "5",  # 부족
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            },
        ],
    )
    assert out["status_code"] == 422
    assert db_session.query(StockRequest).count() == 0
    inv_a = db_session.query(Inventory).filter(Inventory.item_id == item_a.item_id).first()
    inv_b = db_session.query(Inventory).filter(Inventory.item_id == item_b.item_id).first()
    assert inv_a.pending_quantity == Decimal("0")
    assert inv_b.pending_quantity == Decimal("0")


# ---------------------------------------------------------------------------
# 시나리오 4: 승인 → 실재고 이동 + TransactionLog
# ---------------------------------------------------------------------------


def test_approve_consumes_pending_and_moves_stock(db_session, client, make_item):
    item = make_item(name="P004", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="W04", name="요청자D")
    approver = _make_employee(
        db_session, code="WH1", name="창고정", warehouse_role="primary"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "3",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    assert out["status_code"] == 201
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "completed"
    assert body["approved_by_name"] == "창고정"

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("7")
    assert inv.pending_quantity == Decimal("0")

    loc = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert loc is not None and loc.quantity == Decimal("3")

    logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.item_id == item.item_id)
        .all()
    )
    assert len(logs) == 1
    log = logs[0]
    assert log.transaction_type == TransactionTypeEnum.TRANSFER_TO_PROD
    assert log.quantity_change == Decimal("0")  # 총량 불변
    assert log.reference_no == out["body"]["request_code"]
    assert "요청 승인 처리" in (log.notes or "")
    assert "조립" in (log.notes or "")


# ---------------------------------------------------------------------------
# 시나리오 4-자가: 창고 정/부 본인 요청 → 자가승인 (즉시 COMPLETED, pending 미생성)
# ---------------------------------------------------------------------------


def test_warehouse_primary_self_approves_on_submit(db_session, client, make_item):
    """warehouse_role=primary 직원이 본인 명의로 wh-to-dept 제출 시 즉시 처리."""
    item = make_item(name="P004S1", warehouse_qty=Decimal("10"))
    requester = _make_employee(
        db_session, code="WHSELF1", name="창고정자가", warehouse_role="primary"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "4",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    assert out["status_code"] == 201, out["body"]
    body = out["body"]
    # 자가승인: 즉시 COMPLETED, 컬럼은 그대로 True 유지하여 감사 추적 보존
    assert body["status"] == "completed"
    assert body["requires_warehouse_approval"] is True
    assert body["approved_by_employee_id"] == str(requester.employee_id)
    assert body["approved_by_name"] == "창고정자가"

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    # 즉시 차감, pending 자체가 생기지 않음
    assert inv.warehouse_qty == Decimal("6")
    assert inv.pending_quantity == Decimal("0")

    # TransactionLog 즉시 생성
    logs = (
        db_session.query(TransactionLog)
        .filter(TransactionLog.item_id == item.item_id)
        .all()
    )
    assert len(logs) == 1


def test_warehouse_deputy_self_approves_on_submit(db_session, client, make_item):
    """warehouse_role=deputy 도 동일하게 자가승인."""
    item = make_item(name="P004S2", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session, code="WHSELF2", name="창고부자가", warehouse_role="deputy"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "2",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    assert out["status_code"] == 201, out["body"]
    assert out["body"]["status"] == "completed"

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("3")
    assert inv.pending_quantity == Decimal("0")


def test_non_warehouse_requester_still_reserves(db_session, client, make_item):
    """warehouse_role=none 일반 직원의 요청은 종전대로 RESERVED."""
    item = make_item(name="P004S3", warehouse_qty=Decimal("5"))
    requester = _make_employee(
        db_session, code="WHSELF3", name="일반직원", warehouse_role="none"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    assert out["status_code"] == 201, out["body"]
    assert out["body"]["status"] == "reserved"

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.warehouse_qty == Decimal("5")  # 미차감
    assert inv.pending_quantity == Decimal("1")  # 점유만


# ---------------------------------------------------------------------------
# 시나리오 5: 반려 → pending 원복
# ---------------------------------------------------------------------------


def test_reject_releases_pending(db_session, client, make_item):
    item = make_item(name="P005", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="W05", name="요청자E")
    approver = _make_employee(
        db_session, code="WH2", name="창고정2", warehouse_role="primary"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "4",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/reject",
        json={
            "actor_employee_id": str(approver.employee_id),
            "pin": "0000",
            "reason": "수량 잘못 기재",
        },
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "rejected"
    assert body["rejected_reason"] == "수량 잘못 기재"

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == Decimal("0")
    assert inv.warehouse_qty == Decimal("10")


# ---------------------------------------------------------------------------
# 시나리오 6: 본인 취소
# ---------------------------------------------------------------------------


def test_requester_cancel_releases_pending(db_session, client, make_item):
    item = make_item(name="P006", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="W06", name="요청자F")
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "2",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/cancel",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"

    db_session.expire_all()
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv.pending_quantity == Decimal("0")


# ---------------------------------------------------------------------------
# 시나리오 7: DEPT_INTERNAL 즉시 처리
# ---------------------------------------------------------------------------


def test_dept_internal_request_completes_immediately(
    db_session, client, make_item, make_location
):
    item = make_item(name="P007", warehouse_qty=Decimal("0"))
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("5"),
    )
    # InventoryLocation 추가 후 quantity 합 동기화
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("5")
    requester = _make_employee(db_session, code="W07", name="요청자G")
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="dept_internal",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "3",
                "from_bucket": "production",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_bucket": "production",
                "to_department": DepartmentEnum.HIGH_VOLTAGE.value,
            }
        ],
    )
    assert out["status_code"] == 201, out["body"]
    body = out["body"]
    assert body["status"] == "completed"
    assert body["requires_warehouse_approval"] is False
    # 즉시 실행 시에도 approved_at 가 채워져야 함
    assert body["approved_at"] is not None
    assert body["completed_at"] is not None

    db_session.expire_all()
    loc_a = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    loc_b = (
        db_session.query(InventoryLocation)
        .filter(
            InventoryLocation.item_id == item.item_id,
            InventoryLocation.department == DepartmentEnum.HIGH_VOLTAGE,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        )
        .first()
    )
    assert loc_a.quantity == Decimal("2")
    assert loc_b is not None and loc_b.quantity == Decimal("3")

    logs = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.TRANSFER_DEPT
    assert logs[0].reference_no == body["request_code"]


# ---------------------------------------------------------------------------
# 시나리오 8: warehouse_role=none → 403
# ---------------------------------------------------------------------------


def test_non_warehouse_employee_cannot_approve(db_session, client, make_item):
    item = make_item(name="P008", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="W08", name="요청자H")
    not_warehouse = _make_employee(
        db_session, code="X01", name="일반직원", warehouse_role="none"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(not_warehouse.employee_id), "pin": "0000"},
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# 추가: PIN 오류
# ---------------------------------------------------------------------------


def test_approve_rejects_wrong_pin(db_session, client, make_item):
    item = make_item(name="P009", warehouse_qty=Decimal("5"))
    requester = _make_employee(db_session, code="W09", name="요청자I")
    approver = _make_employee(
        db_session, code="WH3", name="창고부", warehouse_role="deputy", pin="1234"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "9999"},
    )
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# 추가: 완료된 요청은 재처리 불가
# ---------------------------------------------------------------------------


def test_completed_request_cannot_be_processed_again(db_session, client, make_item):
    item = make_item(name="P010", warehouse_qty=Decimal("5"))
    requester = _make_employee(db_session, code="W10", name="요청자J")
    approver = _make_employee(
        db_session, code="WH4", name="창고정3", warehouse_role="primary"
    )
    db_session.commit()

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    request_id = out["body"]["request_id"]
    res = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )
    assert res.status_code == 200

    # 재승인 시도
    res2 = client.post(
        f"/api/stock-requests/{request_id}/approve",
        json={"actor_employee_id": str(approver.employee_id), "pin": "0000"},
    )
    assert res2.status_code == 422

    # 취소 시도
    res3 = client.post(
        f"/api/stock-requests/{request_id}/cancel",
        json={"actor_employee_id": str(requester.employee_id), "pin": "0000"},
    )
    assert res3.status_code == 422


# ---------------------------------------------------------------------------
# 추가: 점유 목록 API
# ---------------------------------------------------------------------------


def test_reservations_endpoint_lists_active_pending_lines(db_session, client, make_item):
    item = make_item(name="P011", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="W11", name="요청자K")
    db_session.commit()

    _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "4",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )

    res = client.get(f"/api/stock-requests/reservations?item_id={item.item_id}")
    assert res.status_code == 200
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["requester_name"] == "요청자K"
    assert rows[0]["to_department"] == DepartmentEnum.ASSEMBLY.value
    assert Decimal(rows[0]["quantity"]) == Decimal("4")


# ---------------------------------------------------------------------------
# request_type ↔ bucket 조합 강제 검증 (1차 보완)
# ---------------------------------------------------------------------------
# 잘못된 페이로드로 승인 정책을 우회하려는 시도를 차단하는 검증.
# 모든 케이스에서 (1) 422 응답, (2) StockRequest row 미생성, (3) pending_quantity 불변.


@pytest.mark.parametrize(
    "case_label,request_type,line_overrides",
    [
        # 가장 위험한 케이스: raw_ship 인데 bucket 모두 none → 승인 우회 시도.
        # line_requires_approval(none, none)=False 라서 즉시 실행 분기로 빠질 수 있다.
        (
            "raw_ship_bypass",
            "raw_ship",
            {"from_bucket": "none", "to_bucket": "none"},
        ),
        # raw_receive 인데 to_bucket 도 none → 입고 대상 누락.
        (
            "raw_receive_no_target",
            "raw_receive",
            {"from_bucket": "none", "to_bucket": "none"},
        ),
        # warehouse_to_dept 인데 to_department 누락 → 어느 부서로 갈지 모호.
        (
            "warehouse_to_dept_no_dept",
            "warehouse_to_dept",
            {
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": None,
            },
        ),
        # dept_internal 인데 출발/도착 부서가 같음 → 의미 없는 이동.
        (
            "dept_internal_same_dept",
            "dept_internal",
            {
                "from_bucket": "production",
                "from_department": "조립",
                "to_bucket": "production",
                "to_department": "조립",
            },
        ),
    ],
)
def test_create_request_rejects_invalid_shape(
    db_session, client, make_item, case_label, request_type, line_overrides
):
    """422 응답 + StockRequest row 미생성 + pending_quantity 불변 동시 검증."""
    item = make_item(name=f"PSHAPE_{case_label}", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code=f"WS_{case_label[:6]}", name=f"요청자_{case_label}")
    db_session.commit()

    line_payload = {
        "item_id": str(item.item_id),
        "quantity": "1",
        # 기본값: 정상적인 warehouse_to_dept 형식. case 별 overrides 가 덮어씀.
        "from_bucket": "warehouse",
        "to_bucket": "production",
        "to_department": DepartmentEnum.ASSEMBLY.value,
    }
    # to_department 가 None 으로 명시된 케이스도 그대로 반영되도록 update 사용.
    line_payload.update(line_overrides)

    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type=request_type,
        lines=[line_payload],
    )
    # (1) 422 응답
    assert out["status_code"] == 422, f"{case_label}: {out['body']}"

    # (2) StockRequest row 미생성
    assert db_session.query(StockRequest).count() == 0, case_label

    # (3) pending_quantity 불변 (warehouse_qty 도 그대로)
    db_session.expire_all()
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv.pending_quantity == Decimal("0"), case_label
    assert inv.warehouse_qty == Decimal("10"), case_label


# ===========================================================================
# 직원별 저장형 입출고 장바구니 (DRAFT) — 2차 보완
# ===========================================================================
# 핵심 정책:
# - DRAFT 저장 시 pending_quantity 변화 없음.
# - DRAFT 저장 시 TransactionLog 생성 없음.
# - request_code 는 DRAFT 동안 NULL, submit 시점에만 발급.
# - 직원 + request_type 기준 active draft 1개만 유지.
# - 본인이 아닌 직원의 draft 는 삭제/제출 불가 (403).


def _draft_line_payload(item_id) -> dict:
    return {
        "item_id": str(item_id),
        "quantity": "3",
        "from_bucket": "warehouse",
        "to_bucket": "production",
        "to_department": DepartmentEnum.ASSEMBLY.value,
    }


def _upsert_draft(
    client,
    *,
    requester_id: str,
    request_type: str = "warehouse_to_dept",
    lines: list[dict] | None = None,
    notes: str | None = None,
    reference_no: str | None = None,
) -> dict:
    payload: dict = {
        "requester_employee_id": requester_id,
        "request_type": request_type,
        "lines": lines if lines is not None else [],
    }
    if notes is not None:
        payload["notes"] = notes
    if reference_no is not None:
        payload["reference_no"] = reference_no
    res = client.put("/api/stock-requests/draft", json=payload)
    return {"status_code": res.status_code, "body": res.json() if res.content else None}


# ---------------------------------------------------------------------------
# 1) DRAFT 저장 — pending / TransactionLog 모두 불변
# ---------------------------------------------------------------------------


def test_upsert_draft_creates_draft_without_pending_or_log(db_session, client, make_item):
    item = make_item(name="DRAFT001", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D01", name="장바구니A")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[_draft_line_payload(item.item_id)],
        notes="작성 중",
    )
    assert out["status_code"] == 200, out["body"]
    assert out["body"]["status"] == "draft"
    assert out["body"]["request_code"] is None  # submit 시점에만 발급
    assert out["body"]["submitted_at"] is None
    assert len(out["body"]["lines"]) == 1

    db_session.expire_all()
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv.pending_quantity == Decimal("0")
    assert inv.warehouse_qty == Decimal("10")
    assert (
        db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).count()
        == 0
    )


# ---------------------------------------------------------------------------
# 2) DRAFT 업데이트 — 같은 직원+request_type 두 번 호출 시 row 1개 유지
# ---------------------------------------------------------------------------


def test_upsert_draft_updates_existing_no_new_row(db_session, client, make_item):
    item_a = make_item(name="DRAFT002A", warehouse_qty=Decimal("10"))
    item_b = make_item(name="DRAFT002B", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D02", name="장바구니B")
    db_session.commit()

    out1 = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[_draft_line_payload(item_a.item_id)],
        notes="첫 저장",
    )
    assert out1["status_code"] == 200
    first_id = out1["body"]["request_id"]

    out2 = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[_draft_line_payload(item_b.item_id)],
        notes="두 번째 저장",
        reference_no="REF-X",
    )
    assert out2["status_code"] == 200
    assert out2["body"]["request_id"] == first_id  # 같은 row
    assert out2["body"]["notes"] == "두 번째 저장"
    assert out2["body"]["reference_no"] == "REF-X"
    assert len(out2["body"]["lines"]) == 1
    assert out2["body"]["lines"][0]["item_id"] == str(item_b.item_id)

    db_session.expire_all()
    drafts = (
        db_session.query(StockRequest)
        .filter(StockRequest.status == StockRequestStatusEnum.DRAFT)
        .all()
    )
    assert len(drafts) == 1


# ---------------------------------------------------------------------------
# 3) 직원별 분리 — A 의 draft 는 A 에게만, B 의 draft 는 B 에게만
# ---------------------------------------------------------------------------


def test_drafts_isolated_per_employee(db_session, client, make_item):
    item = make_item(name="DRAFT003", warehouse_qty=Decimal("10"))
    emp_a = _make_employee(db_session, code="DA", name="직원A")
    emp_b = _make_employee(db_session, code="DB", name="직원B")
    db_session.commit()

    _upsert_draft(
        client,
        requester_id=str(emp_a.employee_id),
        lines=[_draft_line_payload(item.item_id)],
        notes="A의 장바구니",
    )
    _upsert_draft(
        client,
        requester_id=str(emp_b.employee_id),
        lines=[_draft_line_payload(item.item_id)],
        notes="B의 장바구니",
    )

    res_a = client.get(
        f"/api/stock-requests/drafts?requester_employee_id={emp_a.employee_id}"
    )
    res_b = client.get(
        f"/api/stock-requests/drafts?requester_employee_id={emp_b.employee_id}"
    )
    assert res_a.status_code == 200
    assert res_b.status_code == 200
    list_a = res_a.json()
    list_b = res_b.json()
    assert len(list_a) == 1 and list_a[0]["notes"] == "A의 장바구니"
    assert len(list_b) == 1 and list_b[0]["notes"] == "B의 장바구니"
    assert list_a[0]["request_id"] != list_b[0]["request_id"]


# ---------------------------------------------------------------------------
# 4) DRAFT 삭제 — row + lines 사라짐, pending 불변
# ---------------------------------------------------------------------------


def test_delete_draft_removes_row_and_lines_no_pending_change(
    db_session, client, make_item
):
    item = make_item(name="DRAFT004", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D04", name="장바구니D")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[_draft_line_payload(item.item_id)],
    )
    request_id = out["body"]["request_id"]

    res = client.delete(
        f"/api/stock-requests/draft/{request_id}"
        f"?requester_employee_id={requester.employee_id}"
    )
    assert res.status_code == 204

    db_session.expire_all()
    request_uuid = uuid.UUID(request_id)
    assert (
        db_session.query(StockRequest)
        .filter(StockRequest.request_id == request_uuid)
        .first()
        is None
    )
    assert (
        db_session.query(StockRequestLine)
        .filter(StockRequestLine.request_id == request_uuid)
        .count()
        == 0
    )
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv.pending_quantity == Decimal("0")
    assert inv.warehouse_qty == Decimal("10")


# ---------------------------------------------------------------------------
# 5) DRAFT 제출 — 창고 승인 필요 → RESERVED, pending 증가, TransactionLog 0
# ---------------------------------------------------------------------------


def test_submit_draft_warehouse_to_dept_reserves(db_session, client, make_item):
    item = make_item(name="DRAFT005", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D05", name="장바구니E")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[_draft_line_payload(item.item_id)],
    )
    request_id = out["body"]["request_id"]
    # 저장 후 pending 변화 없음 — 사전 확인
    db_session.expire_all()
    inv_before = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv_before.pending_quantity == Decimal("0")

    res = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": str(requester.employee_id)},
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "reserved"
    assert body["request_code"] is not None
    assert body["request_code"].startswith("SR-")
    assert body["submitted_at"] is not None

    db_session.expire_all()
    inv_after = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv_after.pending_quantity == Decimal("3")
    assert inv_after.warehouse_qty == Decimal("10")
    # 승인 전이므로 TransactionLog 아직 없음.
    assert (
        db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).count()
        == 0
    )


# ---------------------------------------------------------------------------
# 6) DRAFT 제출 — dept_internal → 즉시 COMPLETED + TransactionLog 생성
# ---------------------------------------------------------------------------


def test_submit_draft_dept_internal_completes_immediately(
    db_session, client, make_item, make_location
):
    item = make_item(name="DRAFT006", warehouse_qty=Decimal("0"))
    make_location(
        item.item_id,
        department=DepartmentEnum.ASSEMBLY,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("5"),
    )
    inv = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    inv.quantity = Decimal("5")
    requester = _make_employee(db_session, code="D06", name="장바구니F")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        request_type="dept_internal",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "2",
                "from_bucket": "production",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_bucket": "production",
                "to_department": DepartmentEnum.HIGH_VOLTAGE.value,
            }
        ],
    )
    assert out["status_code"] == 200, out["body"]
    assert out["body"]["status"] == "draft"
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": str(requester.employee_id)},
    )
    assert res.status_code == 200, res.json()
    body = res.json()
    assert body["status"] == "completed"
    assert body["requires_warehouse_approval"] is False
    assert body["completed_at"] is not None
    assert body["request_code"].startswith("SR-")

    logs = db_session.query(TransactionLog).filter(TransactionLog.item_id == item.item_id).all()
    assert len(logs) == 1
    assert logs[0].transaction_type == TransactionTypeEnum.TRANSFER_DEPT


# ---------------------------------------------------------------------------
# 7) DRAFT 가 아닌 요청 submit 시도 → 422
# ---------------------------------------------------------------------------


def test_submit_non_draft_request_rejected(db_session, client, make_item):
    item = make_item(name="DRAFT007", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D07", name="장바구니G")
    db_session.commit()

    # 일반 흐름으로 직접 생성 (status=RESERVED).
    out = _create_request_via_api(
        client,
        requester_id=str(requester.employee_id),
        request_type="warehouse_to_dept",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_bucket": "warehouse",
                "to_bucket": "production",
                "to_department": DepartmentEnum.ASSEMBLY.value,
            }
        ],
    )
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": str(requester.employee_id)},
    )
    assert res.status_code == 422


# ---------------------------------------------------------------------------
# 8) 빈 lines DRAFT 제출 → 422, status 는 draft 유지
# ---------------------------------------------------------------------------


def test_submit_draft_with_empty_lines_rejected(db_session, client):
    requester = _make_employee(db_session, code="D08", name="장바구니H")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[],  # 빈 lines OK (저장 도중 단계)
        notes="아직 품목 미선택",
    )
    assert out["status_code"] == 200
    assert out["body"]["status"] == "draft"
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": str(requester.employee_id)},
    )
    assert res.status_code == 422

    db_session.expire_all()
    request = (
        db_session.query(StockRequest)
        .filter(StockRequest.request_id == uuid.UUID(request_id))
        .first()
    )
    assert request.status == StockRequestStatusEnum.DRAFT


# ---------------------------------------------------------------------------
# 9) 잘못된 bucket 조합 DRAFT 저장 → 422 (1차 shape 검증 재사용)
# ---------------------------------------------------------------------------


def test_invalid_bucket_combo_draft_rejected(db_session, client, make_item):
    item = make_item(name="DRAFT009", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D09", name="장바구니I")
    db_session.commit()

    # raw_ship + bucket=none/none — 1차에서 차단했던 우회 시도.
    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        request_type="raw_ship",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "1",
                "from_bucket": "none",
                "to_bucket": "none",
            }
        ],
    )
    assert out["status_code"] == 422

    # DRAFT row 도 만들어지지 않아야 함.
    db_session.expire_all()
    assert db_session.query(StockRequest).count() == 0
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv.pending_quantity == Decimal("0")


# ---------------------------------------------------------------------------
# 10) 다른 직원 draft 삭제/제출 시도 → 403, draft 보존, pending 불변
# ---------------------------------------------------------------------------


def test_other_employee_cannot_delete_or_submit_draft(db_session, client, make_item):
    item = make_item(name="DRAFT010", warehouse_qty=Decimal("10"))
    owner = _make_employee(db_session, code="OWN", name="주인")
    intruder = _make_employee(db_session, code="INT", name="침입자")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(owner.employee_id),
        lines=[_draft_line_payload(item.item_id)],
    )
    request_id = out["body"]["request_id"]

    # 침입자가 삭제 시도
    res_del = client.delete(
        f"/api/stock-requests/draft/{request_id}"
        f"?requester_employee_id={intruder.employee_id}"
    )
    assert res_del.status_code == 403

    # 침입자가 submit 시도
    res_sub = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": str(intruder.employee_id)},
    )
    assert res_sub.status_code == 403

    # draft 그대로 보존, pending 불변.
    db_session.expire_all()
    request = (
        db_session.query(StockRequest)
        .filter(StockRequest.request_id == uuid.UUID(request_id))
        .first()
    )
    assert request is not None
    assert request.status == StockRequestStatusEnum.DRAFT
    inv = db_session.query(Inventory).filter_by(item_id=item.item_id).first()
    assert inv.pending_quantity == Decimal("0")


# ---------------------------------------------------------------------------
# 추가 안전망: DRAFT 가 '내 요청' 목록(GET /) 과 창고 승인함(GET /warehouse-queue) 에 섞이지 않는지
# ---------------------------------------------------------------------------


def test_draft_does_not_appear_in_my_requests_or_warehouse_queue(
    db_session, client, make_item
):
    item = make_item(name="DRAFT011", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="D11", name="장바구니K")
    db_session.commit()

    _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        lines=[_draft_line_payload(item.item_id)],
    )

    # GET / (status 미지정) — DRAFT 제외 여야 함.
    res_my = client.get(
        f"/api/stock-requests?requester_employee_id={requester.employee_id}"
    )
    assert res_my.status_code == 200
    assert all(r["status"] != "draft" for r in res_my.json())
    assert len(res_my.json()) == 0  # DRAFT 가 유일하므로 결과 비어야 함.

    # GET /warehouse-queue — DRAFT 미노출.
    res_q = client.get("/api/stock-requests/warehouse-queue")
    assert res_q.status_code == 200
    assert all(r["status"] != "draft" for r in res_q.json())
    assert len(res_q.json()) == 0


# ---------------------------------------------------------------------------
# Fix 4: 존재하지 않는 request_id submit → 404
# ---------------------------------------------------------------------------


def test_submit_nonexistent_request_id_returns_404(db_session, client):
    requester = _make_employee(db_session, code="FIX4", name="테스터Fix4")
    db_session.commit()

    fake_id = str(uuid.uuid4())
    res = client.post(
        f"/api/stock-requests/{fake_id}/submit",
        json={"requester_employee_id": str(requester.employee_id)},
    )
    assert res.status_code == 404, res.json()


# ---------------------------------------------------------------------------
# Fix 3: dept_to_warehouse — 부서 생산 재고 부족 시 submit → 422
# ---------------------------------------------------------------------------


def test_submit_dept_to_warehouse_fails_when_production_stock_insufficient(
    db_session, client, make_item, make_location
):
    item = make_item(name="FIX3001", warehouse_qty=Decimal("0"))
    # 부서 생산 재고 0 (make_location 없음 — InventoryLocation row 없음)
    requester = _make_employee(db_session, code="FIX3A", name="테스터Fix3")
    db_session.commit()

    out = _upsert_draft(
        client,
        requester_id=str(requester.employee_id),
        request_type="dept_to_warehouse",
        lines=[
            {
                "item_id": str(item.item_id),
                "quantity": "5",
                "from_bucket": "production",
                "from_department": DepartmentEnum.ASSEMBLY.value,
                "to_bucket": "warehouse",
            }
        ],
    )
    assert out["status_code"] == 200, out["body"]
    request_id = out["body"]["request_id"]

    res = client.post(
        f"/api/stock-requests/{request_id}/submit",
        json={"requester_employee_id": str(requester.employee_id)},
    )
    assert res.status_code == 422, res.json()
    assert "재고 부족" in res.json().get("detail", {}).get("message", "")
