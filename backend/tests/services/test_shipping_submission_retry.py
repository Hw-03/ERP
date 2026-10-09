"""Concurrent shipping submissions use the real file-SQLite write boundary."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Barrier
import uuid

from sqlalchemy.orm import Session

from app.database import Base, _create_database_engine
from app.models import BOM, DepartmentEnum, Employee, Inventory, InventoryLocation, InventoryOperation, Item, LocationStatusEnum, ProcessType, ShippingAllocation, ShippingRequest, ShippingRequestEvent, SystemSetting, TransactionLog
from app.services.shipping import ShippingError
from app.services.shipping_actions import create_request, pickup_complete, prepare_complete


def test_concurrent_shipping_submission_creates_one_request(tmp_path: Path) -> None:
    engine = _create_database_engine(f"sqlite:///{(tmp_path / 'concurrent-shipping.db').as_posix()}")
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add_all([ProcessType(code=code, prefix=code[0], suffix=code[1], stage_order=index)
                        for index, code in enumerate(("AF", "PA", "PF"), 1)])
            db.flush()
            af, pa, pf = [Item(item_name=code, process_type_code=code, model_symbol="8", serial_no=1, unit="EA")
                          for code in ("AF", "PA", "PF")]
            db.add_all([af, pa, pf])
            db.flush()
            db.add_all([Inventory(item_id=item.item_id, quantity=0, warehouse_qty=0, pending_quantity=0)
                        for item in (af, pa, pf)])
            db.add_all([BOM(parent_item_id=pa.item_id, child_item_id=af.item_id, quantity=1),
                        BOM(parent_item_id=pf.item_id, child_item_id=pa.item_id, quantity=1)])
            pf_id = pf.item_id
            db.commit()
        barrier = Barrier(2)
        request_id = uuid.uuid4()

        def submit() -> uuid.UUID:
            barrier.wait(timeout=10)
            with Session(engine) as db:
                request = create_request(db, {"base_pf_item_id": pf_id}, request_id=request_id,
                                         submission_payload_hash="a" * 64)
                return request.request_id

        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = [pool.submit(submit) for _ in range(2)]
            assert [future.result(timeout=20) for future in pending] == [request_id, request_id]
        with Session(engine) as db:
            assert db.query(ShippingRequest).count() == 1
            assert db.query(ShippingRequestEvent).count() == 1
            assert db.get(ShippingRequest, request_id).submission_payload_hash == "a" * 64
    finally:
        engine.dispose()


def test_concurrent_pickup_consumes_inventory_and_records_ledger_once(tmp_path: Path) -> None:
    """Two real SQLite sessions serialize pickup of the same prepared request."""
    engine = _create_database_engine(f"sqlite:///{(tmp_path / 'concurrent-pickup.db').as_posix()}")
    try:
        Base.metadata.create_all(engine)
        with Session(engine) as db:
            db.add_all([ProcessType(code=code, prefix=code[0], suffix=code[1], stage_order=index)
                        for index, code in enumerate(("AF", "PA", "PF"), 1)])
            db.flush()
            af, pa, pf = [Item(item_name=code, process_type_code=code, model_symbol="8", serial_no=1, unit="EA") for code in ("AF", "PA", "PF")]
            actor = Employee(employee_code="CONCURRENT-PICKER", name="Concurrent picker", role="worker", department=DepartmentEnum.SHIPPING.value, is_active=True)
            db.add_all([af, pa, pf, actor, SystemSetting(setting_key="inventory_operation_cutover_at", setting_value="2026-01-01T00:00:00")])
            db.flush()
            db.add_all([Inventory(item_id=item.item_id, quantity=3 if item is pf else 0, warehouse_qty=0, pending_quantity=0) for item in (af, pa, pf)])
            db.add_all([BOM(parent_item_id=pa.item_id, child_item_id=af.item_id, quantity=1), BOM(parent_item_id=pf.item_id, child_item_id=pa.item_id, quantity=1),
                InventoryLocation(item_id=pf.item_id, department=DepartmentEnum.SHIPPING, status=LocationStatusEnum.PRODUCTION, quantity=3)])
            db.commit()
            request = create_request(db, {"base_pf_item_id": pf.item_id, "invoice_number": "CONCURRENT-PICKUP"})
            prepare_complete(db, request.request_id, "SN", prepared_by_employee_id=actor.employee_id, prepared_by_name=actor.name)
            request_id, actor_id, pf_id = request.request_id, actor.employee_id, pf.item_id
        barrier = Barrier(2)

        def pickup() -> str:
            barrier.wait(timeout=10)
            with Session(engine) as db:
                try:
                    pickup_complete(db, request_id, actor=db.get(Employee, actor_id))
                    return "PICKED_UP"
                except ShippingError as error:
                    assert "준비 완료 요청" in str(error)
                    return "ALREADY_PICKED_UP"

        with ThreadPoolExecutor(max_workers=2) as pool:
            pending = [pool.submit(pickup) for _ in range(2)]
            assert sorted(future.result(timeout=20) for future in pending) == ["ALREADY_PICKED_UP", "PICKED_UP"]
        with Session(engine) as db:
            assert db.get(ShippingRequest, request_id).status.value == "PICKED_UP"
            assert db.query(Inventory).filter_by(item_id=pf_id).one().quantity == 2
            assert db.query(InventoryLocation).filter_by(item_id=pf_id).one().quantity == 2
            assert db.query(ShippingAllocation).filter_by(request_id=request_id, status="CONSUMED").count() == 1
            assert db.query(TransactionLog).filter_by(shipping_request_id=request_id, shipping_phase="PICKUP").count() == 1
            assert db.query(ShippingRequestEvent).filter_by(request_id=request_id, event_type="PICKED_UP").count() == 1
            assert db.query(InventoryOperation).filter_by(domain="shipping", display_label="출하 픽업").count() == 1
    finally:
        engine.dispose()
