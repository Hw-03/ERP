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
