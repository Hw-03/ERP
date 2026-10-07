"""제출 대표 묶음과 기존 일일 작업 묶음의 경계 회귀 검사."""
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from app.models import TransactionTypeEnum
from app.services.transaction_display_groups import group_display_records


def record(**overrides):
    values = dict(log_id=uuid4(), item_id=uuid4(), transaction_type=TransactionTypeEnum.RECEIVE,
                  quantity_change=Decimal(1), created_at=datetime(2026, 9, 1),
                  requested_at=datetime(2026, 9, 1), operation_id=uuid4(), operation_batch_id=None,
                  reference_no=None, shipping_phase=None, produced_by=None, requester_name=None,
                  department=None, reason_category=None, reason_memo=None, submission_id=None,
                  reverses_log_id=None, operation_kind="BUSINESS", operation_effective_status="active")
    values.update(overrides)
    return SimpleNamespace(**values)


def test_submission_keeps_original_work_groups_after_partial_cancellation():
    submission = uuid4()
    originals = [record(submission_id=submission), record(submission_id=submission, operation_effective_status="cancelled")]
    cancellation = record(submission_id=submission, operation_kind="CANCELLATION", reverses_log_id=originals[1].log_id)
    groups = group_display_records([cancellation, *originals], include_submissions=True)
    assert [group.type for group in groups] == ["operation", "submission"]
    assert groups[1].logs == originals
    assert [group.type for group in groups[1].work_groups] == ["operation", "operation"]
    assert {group.key for group in groups[1].work_groups} == {str(log.operation_id) for log in originals}


def test_same_timestamp_different_submissions_remain_separate():
    logs = [record(submission_id=uuid4()), record(submission_id=uuid4())]
    assert len(group_display_records(logs, include_submissions=True)) == 2


def test_io_multi_work_submission_and_default_daily_group_are_distinct():
    batch = uuid4()
    logs = [record(operation_batch_id=batch), record(operation_batch_id=batch)]
    daily = group_display_records(logs)
    assert daily[0].type == "op_batch"
    history = group_display_records(logs, include_submissions=True)
    assert history[0].type == "submission"
    assert len(history[0].work_groups) == 2


def test_io_single_work_retains_operation_detail():
    batch, operation = uuid4(), uuid4()
    logs = [record(operation_batch_id=batch, operation_id=operation) for _ in range(2)]
    history = group_display_records(logs, include_submissions=True)
    assert history[0].type == "operation"
    assert history[0].key == str(operation)


def test_legacy_batch_retains_original_cancellation_unit():
    batch = uuid4()
    logs = [record(operation_batch_id=batch, operation_id=None, operation_kind=None) for _ in range(2)]
    history = group_display_records(logs, include_submissions=True)
    assert len(history) == 1
    assert history[0].type == "op_batch"


def test_submission_with_operation_and_legacy_reference_does_not_duplicate_logs():
    submission = uuid4()
    originals = [record(submission_id=submission, reference_no="LEGACY"), record(submission_id=submission, reference_no="LEGACY", operation_id=None, operation_kind=None)]
    group = group_display_records(originals, include_submissions=True)[0]
    assert group.type == "submission"
    work_log_ids = [log.log_id for work in group.work_groups for log in work.logs]
    assert len(work_log_ids) == len(set(work_log_ids)) == len(originals)
