"""불량 연결의 60초 계약을 유지하며 오래된 다른 후보의 반복 비교를 제한한다."""

from datetime import datetime, timedelta
from decimal import Decimal
from uuid import NAMESPACE_URL, uuid5

import pytest

from app.models import TransactionTypeEnum
from app.services import transaction_display_groups as service


def _record(index: int, created_at: datetime, kind: TransactionTypeEnum) -> service.DisplayGroupRecord:
    """정상 그룹 입력을 만들며 모든 후보의 업무 필드는 의도적으로 같게 둔다."""
    return service.DisplayGroupRecord(
        log_id=uuid5(NAMESPACE_URL, f"defect-window-{index}"),
        item_id=uuid5(NAMESPACE_URL, "defect-window-item"), transaction_type=kind,
        quantity_change=Decimal(-1), created_at=created_at, requested_at=created_at,
        operation_id=None, operation_batch_id=None, reference_no=None, shipping_phase=None,
        produced_by="작업자", requester_name=None, department="튜브",
        reason_category="불량", reason_memo="검사", operation_kind=None, operation_effective_status=None,
    )


def test_unmatched_older_defects_do_not_scan_all_later_work(monkeypatch: pytest.MonkeyPatch) -> None:
    """같은 업무 정보라도 60초 밖 기록은 연결 후보 수를 제곱으로 늘리지 않는다."""
    parents = [_record(index, datetime(2026, 9, 1) + timedelta(minutes=10 * index),
                       TransactionTypeEnum.MARK_DEFECTIVE) for index in range(300)]
    exact = _record(300, parents[-1].created_at + timedelta(seconds=60), TransactionTypeEnum.DEFECT_SCRAP)
    outside = _record(301, parents[-1].created_at + timedelta(seconds=61), TransactionTypeEnum.SUPPLIER_RETURN)
    original = service._is_matching_defect_lifecycle
    comparisons = 0

    def count(parent: service.DisplayGroupRecord, child: service.DisplayGroupRecord) -> bool:
        """실제 업무 비교를 바꾸지 않고 탐색량만 센다."""
        nonlocal comparisons
        comparisons += 1
        return original(parent, child)

    monkeypatch.setattr(service, "_is_matching_defect_lifecycle", count)
    assert service._find_defect_lifecycle_pairs([*parents, exact, outside]) == [(parents[-1], exact)]
    assert comparisons <= 3 * (len(parents) + 2)


def test_final_datetime_boundary_does_not_require_adding_a_minute() -> None:
    """일자 상한에서도 뺄셈으로 판정해 기존 60초 연결을 보존한다."""
    parent = _record(0, datetime.max - timedelta(seconds=60), TransactionTypeEnum.MARK_DEFECTIVE)
    child = _record(1, datetime.max, TransactionTypeEnum.DISASSEMBLE)
    assert service._find_defect_lifecycle_pairs([child, parent]) == [(parent, child)]
