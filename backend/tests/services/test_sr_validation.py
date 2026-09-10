"""다건 불량 선택의 제출 직전 잠금 계약 회귀 테스트."""

from decimal import Decimal
from types import SimpleNamespace
import uuid

from app.models import DepartmentEnum, RequestBucketEnum
from app.repositories import item_repository
from app.services import defect_records as defect_records_svc
from app.services.sr_validation import LineInput, _preflight_defective_check


def test_exact_defect_preflight_locks_records_in_deterministic_order(monkeypatch) -> None:
    first_id = uuid.UUID("00000000-0000-0000-0000-000000000001")
    second_id = uuid.UUID("00000000-0000-0000-0000-000000000002")
    item_id = uuid.uuid4()
    lock_order: list[str] = []
    calls: list[tuple[uuid.UUID | None, bool]] = []
    records = {
        first_id: SimpleNamespace(record_id=first_id),
        second_id: SimpleNamespace(record_id=second_id),
    }

    def get_record_for_action(
        _db: object,
        *,
        record_id: uuid.UUID,
        item_id: uuid.UUID,
        department: object,
        lock: bool = True,
    ) -> SimpleNamespace:
        lock_order.append("record")
        calls.append((record_id, lock))
        return records[record_id]

    def lock_active_many(_db: object, item_ids: object) -> dict[uuid.UUID, object]:
        assert list(item_ids) == [item_id, item_id]
        lock_order.append("item")
        return {item_id: object()}

    exact_flags: list[bool] = []

    def ensure_available(
        _db: object,
        _record: object,
        _quantity: Decimal,
        *,
        require_exact: bool = False,
        **_kwargs: object,
    ) -> None:
        exact_flags.append(require_exact)

    monkeypatch.setattr(defect_records_svc, "_get_record_for_action", get_record_for_action)
    monkeypatch.setattr(defect_records_svc, "_ensure_available", ensure_available)
    monkeypatch.setattr(item_repository, "lock_active_many", lock_active_many)
    lines = [
        LineInput(
            item_id=item_id,
            quantity=Decimal("1"),
            from_bucket=RequestBucketEnum.DEFECTIVE,
            from_department=DepartmentEnum.ASSEMBLY,
            to_bucket=RequestBucketEnum.NONE,
            to_department=None,
            record_id=record_id,
        )
        for record_id in (second_id, first_id)
    ]

    _preflight_defective_check(object(), lines, require_exact_records=True)

    assert lock_order == ["item", "record", "record"]
    assert calls == [(first_id, True), (second_id, True)]
    assert exact_flags == [True, True]
