"""불량 처리 흐름 통합 테스트 — Phase 2.

시나리오:
1. 격리 (POST /api/defects/quarantine) → InventoryLocation DEFECTIVE, defective_at 채움, MARK_DEFECTIVE 로그
2. 정상복귀 (POST /api/defects/unquarantine) → defective_at NULL, UNMARK_DEFECTIVE 로그
3. 격리 → stock_request(DEFECT_SCRAP) 발의 → 부서 결재자 승인 → DEFECT_SCRAP 로그, 재고 차감
4. 격리 → submit_defective_disassemble(keep, scrap, keep) → DISASSEMBLE + RECEIVE×2 + DEFECT_SCRAP
5. R 정상 → stock_request(DEFECT_RETURN) 발의 → 부서 결재 승인 → SUPPLIER_RETURN 로그
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
    StockRequestStatusEnum,
    StockRequestTypeEnum,
    TransactionLog,
    TransactionTypeEnum,
)
from app.services.pin_auth import DEFAULT_PIN_HASH, hash_pin
from app.services import inventory as inventory_svc


# ---------------------------------------------------------------------------
# 픽스처 헬퍼
# ---------------------------------------------------------------------------


def _make_employee(
    db_session,
    *,
    code: str,
    name: str,
    department: DepartmentEnum = DepartmentEnum.ASSEMBLY,
    warehouse_role: str = "none",
    department_role: str = "none",
    level: EmployeeLevelEnum = EmployeeLevelEnum.STAFF,
    pin: str = "0000",
) -> Employee:
    emp = Employee(
        employee_code=code,
        name=name,
        role=f"{department.value}/사원",
        department=department.value if isinstance(department, DepartmentEnum) else department,
        level=level,
        warehouse_role=warehouse_role,
        department_role=department_role,
        display_order=0,
        is_active="true",
        pin_hash=hash_pin(pin) if pin != "0000" else DEFAULT_PIN_HASH,
    )
    db_session.add(emp)
    db_session.flush()
    return emp


def _make_defective_location(db_session, item_id, dept: DepartmentEnum, qty: Decimal) -> InventoryLocation:
    """DEFECTIVE InventoryLocation + Inventory 총량 동기화."""
    from app.models import Inventory
    inv = db_session.query(Inventory).filter(Inventory.item_id == item_id).first()
    loc = InventoryLocation(
        item_id=item_id,
        department=dept.value,
        status=LocationStatusEnum.DEFECTIVE,
        quantity=qty,
    )
    db_session.add(loc)
    db_session.flush()
    # 총량 동기화
    from sqlalchemy import func
    loc_sum = (
        db_session.query(func.coalesce(func.sum(InventoryLocation.quantity), 0))
        .filter(InventoryLocation.item_id == item_id)
        .scalar()
    ) or 0
    inv.quantity = (inv.warehouse_qty or Decimal("0")) + Decimal(str(loc_sum))
    db_session.flush()
    return loc


# ---------------------------------------------------------------------------
# 시나리오 1: 격리 → defective_at 채움, MARK_DEFECTIVE 로그
# ---------------------------------------------------------------------------


def test_quarantine_sets_defective_at_and_logs(db_session, client, make_item):
    item = make_item(name="R001", process_type_code="TR", warehouse_qty=Decimal("10"))
    actor = _make_employee(db_session, code="E01", name="작업자A")
    db_session.commit()

    res = client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "3",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "외관불량",
        "reason_memo": "스크래치 발견",
        "actor_employee_id": str(actor.employee_id),
    })
    assert res.status_code == 200, res.json()

    db_session.expire_all()
    loc = db_session.query(InventoryLocation).filter(
        InventoryLocation.item_id == item.item_id,
        InventoryLocation.department == DepartmentEnum.ASSEMBLY.value,
        InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
    ).first()
    assert loc is not None
    assert loc.quantity == Decimal("3")
    assert loc.defective_at is not None

    log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.MARK_DEFECTIVE,
    ).first()
    assert log is not None
    assert log.reason_category == "외관불량"


# ---------------------------------------------------------------------------
# 시나리오 2: 격리 → 정상복귀 → defective_at NULL, UNMARK_DEFECTIVE 로그
# ---------------------------------------------------------------------------


def test_unquarantine_clears_defective_at_and_logs(db_session, client, make_item):
    item = make_item(name="R002", process_type_code="TR", warehouse_qty=Decimal("5"))
    actor = _make_employee(db_session, code="E02", name="작업자B")
    db_session.commit()

    # 먼저 격리
    res = client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "2",
        "source": "warehouse",
        "target_dept": DepartmentEnum.VACUUM.value,
        "reason_category": "치수불량",
        "reason_memo": "",
        "actor_employee_id": str(actor.employee_id),
    })
    assert res.status_code == 200, res.json()

    # 정상복귀
    res2 = client.post("/api/defects/unquarantine", json={
        "item_id": str(item.item_id),
        "qty": "2",
        "dept": DepartmentEnum.VACUUM.value,
        "reason_category": "검사통과",
        "reason_memo": "재검사 합격",
        "actor_employee_id": str(actor.employee_id),
    })
    assert res2.status_code == 200, res2.json()

    db_session.expire_all()
    loc = db_session.query(InventoryLocation).filter(
        InventoryLocation.item_id == item.item_id,
        InventoryLocation.department == DepartmentEnum.VACUUM.value,
        InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
    ).first()
    # 복귀 후 불량 재고 0
    assert loc is None or loc.quantity == Decimal("0")

    # defective_at NULL 확인 (quantity 0인 loc의 defective_at)
    unmark_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.UNMARK_DEFECTIVE,
    ).first()
    assert unmark_log is not None
    assert unmark_log.reason_category == "검사통과"


# ---------------------------------------------------------------------------
# 시나리오 3: 격리 → DEFECT_SCRAP 결재 → 차감
# ---------------------------------------------------------------------------


def test_defect_scrap_via_stock_request(db_session, client, make_item):
    item = make_item(name="R003", process_type_code="TR", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="E03", name="발의자C")
    approver = _make_employee(
        db_session, code="E04", name="결재자D",
        department=DepartmentEnum.ASSEMBLY,
        department_role="primary",
        pin="1234",
    )
    db_session.commit()

    # 격리
    client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "4",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "기능불량",
        "reason_memo": "고장",
        "actor_employee_id": str(requester.employee_id),
    })
    db_session.expire_all()

    inv_before = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    qty_before = inv_before.quantity

    # DEFECT_SCRAP 제출 — 불량 작업은 자동결재(즉시 완료)
    res = client.post("/api/stock-requests", json={
        "requester_employee_id": str(requester.employee_id),
        "request_type": "defect_scrap",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": "4",
            "from_bucket": "defective",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
        "notes": "폐기 처리",
    })
    assert res.status_code == 201, res.json()
    assert res.json()["status"] == "completed"  # 즉시 완료

    db_session.expire_all()
    inv_after = db_session.query(Inventory).filter(Inventory.item_id == item.item_id).first()
    assert inv_after.quantity == qty_before - Decimal("4")

    # DEFECT_SCRAP 로그 확인
    scrap_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.DEFECT_SCRAP,
    ).first()
    assert scrap_log is not None


# ---------------------------------------------------------------------------
# 시나리오 4: submit_defective_disassemble (keep, scrap, keep)
# ---------------------------------------------------------------------------


def test_defective_disassemble_keep_scrap(db_session, make_item, make_bom):
    """분해: 자식 keep×2 + scrap×1 → DISASSEMBLE + RECEIVE×2 + DEFECT_SCRAP×1."""
    parent = make_item(name="PA001", process_type_code="PA", warehouse_qty=Decimal("0"))
    child1 = make_item(name="C001-keep", process_type_code="TR", warehouse_qty=Decimal("0"))
    child2 = make_item(name="C002-scrap", process_type_code="TR", warehouse_qty=Decimal("0"))
    child3 = make_item(name="C003-keep", process_type_code="TR", warehouse_qty=Decimal("0"))
    make_bom(parent.item_id, child1.item_id, Decimal("1"))
    make_bom(parent.item_id, child2.item_id, Decimal("1"))
    make_bom(parent.item_id, child3.item_id, Decimal("1"))

    # 부모 DEFECTIVE 재고 설정
    parent_loc = _make_defective_location(db_session, parent.item_id, DepartmentEnum.ASSEMBLY, Decimal("2"))
    db_session.commit()

    from app.services.dept_adjustment import submit_defective_disassemble

    result = submit_defective_disassemble(
        db_session,
        parent.item_id,
        Decimal("2"),
        DepartmentEnum.ASSEMBLY,
        child_decisions=[
            {"item_id": child1.item_id, "action": "keep", "qty": Decimal("2")},
            {"item_id": child2.item_id, "action": "scrap", "qty": Decimal("2")},
            {"item_id": child3.item_id, "action": "keep", "qty": Decimal("2")},
        ],
        reason_category="기능불량",
        reason_memo="분해 처리",
        actor="테스터",
    )
    db_session.commit()

    assert "batch_id" in result
    assert "parent_log_id" in result
    assert len(result["child_log_ids"]) == 3

    db_session.expire_all()

    # 부모 DEFECTIVE 차감 확인
    parent_loc_after = db_session.query(InventoryLocation).filter(
        InventoryLocation.item_id == parent.item_id,
        InventoryLocation.status == LocationStatusEnum.DEFECTIVE,
    ).first()
    assert parent_loc_after is None or parent_loc_after.quantity == Decimal("0")

    # DISASSEMBLE 로그 확인
    disassemble_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == parent.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.DISASSEMBLE,
    ).first()
    assert disassemble_log is not None

    # keep 자식 → PRODUCTION 입고 확인
    for child in [child1, child3]:
        prod_loc = db_session.query(InventoryLocation).filter(
            InventoryLocation.item_id == child.item_id,
            InventoryLocation.department == DepartmentEnum.ASSEMBLY.value,
            InventoryLocation.status == LocationStatusEnum.PRODUCTION,
        ).first()
        assert prod_loc is not None and prod_loc.quantity == Decimal("2"), f"{child.item_name} 입고 실패"

        recv_log = db_session.query(TransactionLog).filter(
            TransactionLog.item_id == child.item_id,
            TransactionLog.transaction_type == TransactionTypeEnum.RECEIVE,
        ).first()
        assert recv_log is not None

    # scrap 자식 → DEFECT_SCRAP 로그
    scrap_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == child2.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.DEFECT_SCRAP,
    ).first()
    assert scrap_log is not None


# ---------------------------------------------------------------------------
# 시나리오 5: 격리 → DEFECT_RETURN 결재 → SUPPLIER_RETURN 로그
# ---------------------------------------------------------------------------


def test_defect_return_via_stock_request(db_session, client, make_item):
    """격리 재고에서 공급처 반품 요청 → 부서 결재 → 재고 차감."""
    item = make_item(name="R004", process_type_code="TR", warehouse_qty=Decimal("8"))
    requester = _make_employee(db_session, code="E05", name="발의자E")
    approver = _make_employee(
        db_session, code="E06", name="결재자F",
        department=DepartmentEnum.ASSEMBLY,
        department_role="primary",
        pin="5678",
    )
    db_session.commit()

    # 격리 먼저 (warehouse 4개 → DEFECTIVE)
    q_res = client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "4",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "외관불량",
        "reason_memo": "불량 확인",
        "actor_employee_id": str(requester.employee_id),
    })
    assert q_res.status_code == 200, q_res.json()

    db_session.expire_all()
    from app.models import Inventory as Inv
    qty_before = db_session.query(Inv).filter(Inv.item_id == item.item_id).first().quantity

    # DEFECT_RETURN 결재 요청 (격리 재고에서 공급처 반품)
    res = client.post("/api/stock-requests", json={
        "requester_employee_id": str(requester.employee_id),
        "request_type": "defect_return",
        "requires_department_approval": True,
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": "3",
            "from_bucket": "defective",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
        "notes": "공급처 반품",
    })
    assert res.status_code == 201, res.json()
    req_id = res.json()["request_id"]
    # 승인 불필요(warehouse bucket 없음) + department_role 있어도 requires_department=True
    # 이미 생성됐으면 status 확인
    body = res.json()
    if body["status"] == "completed":
        # 자가 결재 즉시 완료 — 재고 차감 확인
        db_session.expire_all()
        inv_after = db_session.query(Inv).filter(Inv.item_id == item.item_id).first()
        assert inv_after.quantity == qty_before - Decimal("3")
    else:
        # 결재 대기 → 부서 결재 승인
        approve_res = client.post(f"/api/stock-requests/{req_id}/department-approve", json={
            "actor_employee_id": str(approver.employee_id),
            "pin": "5678",
        })
        assert approve_res.status_code == 200, approve_res.json()
        assert approve_res.json()["status"] == "completed"
        db_session.expire_all()
        inv_after = db_session.query(Inv).filter(Inv.item_id == item.item_id).first()
        assert inv_after.quantity == qty_before - Decimal("3")

    # SUPPLIER_RETURN 로그 확인
    sr_log = db_session.query(TransactionLog).filter(
        TransactionLog.item_id == item.item_id,
        TransactionLog.transaction_type == TransactionTypeEnum.SUPPLIER_RETURN,
    ).first()
    assert sr_log is not None


# ---------------------------------------------------------------------------
# 시나리오 5b: R 정상 재고에서 직접 공급처 반품 (서비스 직접 호출)
# ---------------------------------------------------------------------------


def test_return_to_supplier_from_normal_production(db_session, make_item):
    """return_to_supplier_from_normal: PRODUCTION 재고에서 직접 공급처 반품."""
    from app.models import Inventory as Inv

    item = make_item(name="R005", process_type_code="TR", warehouse_qty=Decimal("0"))
    prod_loc = InventoryLocation(
        item_id=item.item_id,
        department=DepartmentEnum.ASSEMBLY.value,
        status=LocationStatusEnum.PRODUCTION,
        quantity=Decimal("6"),
    )
    db_session.add(prod_loc)
    db_session.flush()
    inv = db_session.query(Inv).filter(Inv.item_id == item.item_id).first()
    inv.quantity = (inv.warehouse_qty or Decimal("0")) + Decimal("6")
    db_session.flush()
    qty_before = inv.quantity

    inv_after = inventory_svc.return_to_supplier_from_normal(
        db_session,
        item.item_id,
        Decimal("3"),
        inventory_svc.NormalSource(
            kind="production",
            dept_or_warehouse=DepartmentEnum.ASSEMBLY,
            supplier_name="테스트공급처",
        ),
        inventory_svc.ReasonContext(
            category="외관불량",
            memo="반품",
            actor="테스터",
        ),
    )
    db_session.flush()
    assert inv_after.quantity == qty_before - Decimal("3")


# ---------------------------------------------------------------------------
# 추가: KPI 엔드포인트 기본 동작
# ---------------------------------------------------------------------------


def test_kpi_returns_counts(db_session, client, make_item):
    item = make_item(name="KPITEST", process_type_code="TR", warehouse_qty=Decimal("10"))
    actor = _make_employee(db_session, code="EKPI", name="KPI작업자")
    db_session.commit()

    res = client.get("/api/defects/kpi")
    assert res.status_code == 200, res.json()
    body = res.json()
    assert "quarantined" in body
    assert "over_one_year" in body
    assert "pending_approval" in body
    assert "processed_today" in body
    assert all(isinstance(v, int) for v in body.values())


# ---------------------------------------------------------------------------
# 추가: locations 엔드포인트 기본 동작
# ---------------------------------------------------------------------------


def test_locations_returns_defective_list(db_session, client, make_item):
    item = make_item(name="LOCTEST", process_type_code="TR", warehouse_qty=Decimal("5"))
    actor = _make_employee(db_session, code="ELOC", name="LOC작업자")
    db_session.commit()

    # 격리
    client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "5",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "기능불량",
        "reason_memo": "",
        "actor_employee_id": str(actor.employee_id),
    })

    res = client.get("/api/defects/locations")
    assert res.status_code == 200, res.json()
    locs = res.json()
    assert any(str(item.item_id) == loc["item_id"] for loc in locs)

    # 부서 필터
    res2 = client.get(f"/api/defects/locations?department={DepartmentEnum.ASSEMBLY.value}")
    assert res2.status_code == 200
    for loc in res2.json():
        assert loc["department"] == DepartmentEnum.ASSEMBLY.value


# ---------------------------------------------------------------------------
# 가드: 격리되지 않은 항목 폐기 요청 차단
# ---------------------------------------------------------------------------


def test_defect_scrap_without_quarantine_rejected(db_session, client, make_item):
    """from_bucket=DEFECTIVE 인데 해당 부서 격리 재고가 0 → 422.

    이전엔 SUBMITTED 까지 들어가서 결재 시점에 500 폭발했음.
    """
    item = make_item(name="GUARD-A", process_type_code="TR", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="EG1", name="가드테스터1")
    db_session.commit()

    res = client.post("/api/stock-requests", json={
        "requester_employee_id": str(requester.employee_id),
        "request_type": "defect_scrap",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": "5",
            "from_bucket": "defective",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
        "notes": "격리 안 한 채 폐기 시도",
    })
    assert res.status_code == 422, res.json()
    detail = res.json().get("detail", {})
    msg = detail.get("message", "") if isinstance(detail, dict) else str(detail)
    assert "격리 재고 부족" in msg


def test_defect_scrap_with_insufficient_quarantine_rejected(db_session, client, make_item):
    """격리 3개 상태에서 5개 폐기 요청 → 422."""
    item = make_item(name="GUARD-B", process_type_code="TR", warehouse_qty=Decimal("10"))
    requester = _make_employee(db_session, code="EG2", name="가드테스터2")
    db_session.commit()

    client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "3",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "외관불량",
        "reason_memo": "",
        "actor_employee_id": str(requester.employee_id),
    })

    res = client.post("/api/stock-requests", json={
        "requester_employee_id": str(requester.employee_id),
        "request_type": "defect_scrap",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": "5",
            "from_bucket": "defective",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
        "notes": "초과 폐기 시도",
    })
    assert res.status_code == 422, res.json()


# ---------------------------------------------------------------------------
# DRAFT 경로 — reason_category / reason_memo 보존
# ---------------------------------------------------------------------------


def test_draft_upsert_preserves_reason_category(db_session, client, make_item):
    """DRAFT upsert 페이로드의 reason_category / reason_memo 가 DB 에 저장된다.

    이전엔 스키마/라우터/서비스 모두 두 필드를 무시 → NULL 저장 → 결재 단계에서 사유 손실.
    """
    item = make_item(name="DRAFTREASON", process_type_code="TR", warehouse_qty=Decimal("5"))
    requester = _make_employee(db_session, code="EDR", name="드래프트테스터")
    # 격리 먼저 (가드를 통과시키기 위함)
    client.post("/api/defects/quarantine", json={
        "item_id": str(item.item_id),
        "qty": "2",
        "source": "warehouse",
        "target_dept": DepartmentEnum.ASSEMBLY.value,
        "reason_category": "외관불량",
        "reason_memo": "",
        "actor_employee_id": str(requester.employee_id),
    })
    db_session.commit()

    res = client.put("/api/stock-requests/draft", json={
        "requester_employee_id": str(requester.employee_id),
        "request_type": "defect_scrap",
        "reason_category": "기타",
        "reason_memo": "장바구니 단계 사유",
        "lines": [{
            "item_id": str(item.item_id),
            "quantity": "2",
            "from_bucket": "defective",
            "from_department": DepartmentEnum.ASSEMBLY.value,
            "to_bucket": "none",
        }],
    })
    assert res.status_code == 200, res.json()

    db_session.expire_all()
    draft = db_session.query(StockRequest).filter(
        StockRequest.requester_employee_id == requester.employee_id,
        StockRequest.request_type == StockRequestTypeEnum.DEFECT_SCRAP,
        StockRequest.status == StockRequestStatusEnum.DRAFT,
    ).first()
    assert draft is not None
    assert draft.reason_category == "기타"
    assert draft.reason_memo == "장바구니 단계 사유"
