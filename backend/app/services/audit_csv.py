"""외부 심사 대응용 입출고 CSV 미러.

DB 의 `TransactionLog` 가 source-of-truth 이고, 이 모듈은 그 미러를 디스크에 떨군다.
- 자재 이동 거래(RECEIVE/SHIP/TRANSFER_*/ADJUST/SUPPLIER_RETURN/
  MARK_DEFECTIVE/DISASSEMBLE/INTERNAL_USE) 만 기록한다. 생산 내부 소비(PRODUCE/BACKFLUSH)는 제외.
- 월별 CSV (`inout_YYYY-MM.csv`) 에 거래 1건 = 1줄로 append.
- `created_at` 기준으로 파일이 결정되므로 월말 자정 경계도 자연스럽게 분기된다.
- 트랜잭션이 commit 된 직후에만 append (롤백된 거래는 남지 않는다). 파일 IO 실패는
  거래 자체를 막지 않으며, 누락분은 `scripts/dev/backfill_audit_csv.py` 가 메운다.
"""

from __future__ import annotations

import csv
import logging
import os
import threading
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy import event
from sqlalchemy.orm import Session

from app.database import BACKEND_DIR, SessionLocal
from app.models import Employee, Item, TransactionLog, TransactionTypeEnum

_log = logging.getLogger(__name__)


# 외부 로그에 포함할 거래 유형 — 자재 이동만.
AUDIT_TX_TYPES: frozenset[TransactionTypeEnum] = frozenset({
    TransactionTypeEnum.RECEIVE,
    TransactionTypeEnum.SHIP,
    TransactionTypeEnum.TRANSFER_TO_PROD,
    TransactionTypeEnum.TRANSFER_TO_WH,
    TransactionTypeEnum.TRANSFER_DEPT,
    TransactionTypeEnum.ADJUST,
    TransactionTypeEnum.SUPPLIER_RETURN,
    TransactionTypeEnum.MARK_DEFECTIVE,
    TransactionTypeEnum.DISASSEMBLE,
    TransactionTypeEnum.INTERNAL_USE,
})


# 한글 라벨 — 본 모듈이 외부 제출용 단일 진실. 라우터의 `_TX_OP` 와 표현이 달라질
# 수 있으므로 의존하지 않고 자체 정의한다.
TX_TYPE_LABEL_KO: dict[str, str] = {
    "RECEIVE": "입고",
    "SHIP": "출고",
    "TRANSFER_TO_PROD": "창고→생산 이동",
    "TRANSFER_TO_WH": "생산→창고 이동",
    "TRANSFER_DEPT": "부서간 이동",
    "ADJUST": "수량 조정",
    "SUPPLIER_RETURN": "공급사 반품",
    "MARK_DEFECTIVE": "불량 처리",
    "DISASSEMBLE": "분해",
    "INTERNAL_USE": "AS·연구 사용출고",
}


CSV_HEADERS: list[str] = [
    "일시",
    "거래유형",
    "품목코드",
    "품목명",
    "수량",
    "변경전 재고",
    "변경후 재고",
    "참조번호",
    "처리자",
    "처리자사번",
    "비고",
    "거래ID",
]


_file_lock = threading.Lock()


def get_csv_dir() -> Path:
    """CSV 디렉터리 경로. `AUDIT_CSV_DIR` 환경 변수로 override 가능."""
    override = os.environ.get("AUDIT_CSV_DIR", "").strip()
    if override:
        path = Path(override)
    else:
        path = BACKEND_DIR / "data" / "audit_csv"
    path.mkdir(parents=True, exist_ok=True)
    return path


def path_for_month(dt: datetime) -> Path:
    return get_csv_dir() / f"inout_{dt.strftime('%Y-%m')}.csv"


def _fmt_num(value) -> str:
    if value is None:
        return ""
    # Numeric → 보기 좋은 문자열 (불필요한 trailing zero 제거)
    s = f"{value:f}" if not isinstance(value, str) else value
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s or "0"


def row_from_log(
    log: TransactionLog,
    item: Item | None,
    emp_code_by_id: dict | None = None,
) -> list[str]:
    """`TransactionLog` 1건 → CSV 한 줄 (12컬럼)."""
    tx_value = log.transaction_type.value if hasattr(log.transaction_type, "value") else str(log.transaction_type)
    mes_code = ""
    item_name = ""
    if item:
        mes_code = item.mes_code or ""
        item_name = item.item_name or ""
    emp_code = ""
    if log.producer_employee_id is not None and emp_code_by_id:
        emp_code = emp_code_by_id.get(log.producer_employee_id, "") or ""
    tx_label = TX_TYPE_LABEL_KO.get(tx_value, tx_value)
    if tx_value == TransactionTypeEnum.INTERNAL_USE.value:
        tx_label = {
            "AS": "AS 반출",
            "연구": "연구소 반출",
        }.get(log.department, "AS·연구 사용출고")
    return [
        log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else "",
        tx_label,
        mes_code,
        item_name,
        _fmt_num(log.quantity_change),
        _fmt_num(log.quantity_before),
        _fmt_num(log.quantity_after),
        log.reference_no or "",
        log.produced_by or "",
        emp_code,
        (log.notes or "").replace("\r", " ").replace("\n", " "),
        str(log.log_id),
    ]


def _append_rows(rows_by_month: dict[Path, list[list[str]]]) -> None:
    if not rows_by_month:
        return
    with _file_lock:
        for path, rows in rows_by_month.items():
            new_file = not path.exists()
            try:
                with path.open("a", newline="", encoding="utf-8-sig") as f:
                    w = csv.writer(f)
                    if new_file:
                        w.writerow(CSV_HEADERS)
                    w.writerows(rows)
            except OSError:
                _log.exception("audit_csv append 실패 path=%s rows=%d", path, len(rows))


def _append_logs(
    logs: Iterable[TransactionLog],
    items_by_id: dict,
    emp_code_by_id: dict | None = None,
) -> None:
    """주어진 TransactionLog 들을 월별로 묶어 한 번에 append."""
    rows_by_month: dict[Path, list[list[str]]] = defaultdict(list)
    for log in logs:
        if log.transaction_type not in AUDIT_TX_TYPES:
            continue
        if log.created_at is None:
            continue
        item = items_by_id.get(log.item_id)
        rows_by_month[path_for_month(log.created_at)].append(
            row_from_log(log, item, emp_code_by_id)
        )
    _append_rows(rows_by_month)


# ---------------------------------------------------------------------------
# Backfill / catch-up
# ---------------------------------------------------------------------------


def list_available_months() -> list[dict]:
    """현재 디스크에 존재하는 월별 파일 메타데이터를 반환."""
    csv_dir = get_csv_dir()
    result: list[dict] = []
    for path in sorted(csv_dir.glob("inout_*.csv")):
        try:
            stat = path.stat()
            # 헤더 1줄 제외한 라인 수 = 거래 건수
            with path.open("r", encoding="utf-8-sig") as f:
                row_count = sum(1 for _ in f) - 1
            row_count = max(row_count, 0)
        except OSError:
            continue
        result.append({
            "month": path.stem.replace("inout_", ""),
            "file_name": path.name,
            "size_bytes": stat.st_size,
            "row_count": row_count,
        })
    return result


def backfill_all(db: Session, *, overwrite: bool = True) -> dict:
    """DB 의 모든 자재 이동 거래를 월별 CSV 로 재작성한다 (idempotent).

    `overwrite=True` 이면 기존 파일을 새로 쓴다 (default). 운영 중에도 안전하게
    재실행 가능하며, 잘못 쌓인 row 가 있어도 DB 기준으로 정리된다.
    """
    csv_dir = get_csv_dir()
    if overwrite:
        for old in csv_dir.glob("inout_*.csv"):
            try:
                old.unlink()
            except OSError:
                _log.warning("기존 audit_csv 파일 삭제 실패: %s", old)

    rows_by_month: dict[Path, list[list[str]]] = defaultdict(list)
    item_cache: dict = {}
    total = 0

    # 직원 테이블은 작으므로 사번 맵을 한 번에 구성 (producer_employee_id → employee_code).
    emp_code_by_id = {e.employee_id: e.employee_code for e in db.query(Employee).all()}

    q = (
        db.query(TransactionLog)
        .filter(TransactionLog.transaction_type.in_(AUDIT_TX_TYPES))
        .order_by(TransactionLog.created_at.asc())
        .yield_per(500)
    )
    for log in q:
        if log.created_at is None:
            continue
        item = item_cache.get(log.item_id)
        if item is None:
            item = db.query(Item).filter(Item.item_id == log.item_id).one_or_none()
            item_cache[log.item_id] = item
        rows_by_month[path_for_month(log.created_at)].append(
            row_from_log(log, item, emp_code_by_id)
        )
        total += 1

    _append_rows(rows_by_month)
    return {
        "total_rows": total,
        "months": sorted(p.stem.replace("inout_", "") for p in rows_by_month.keys()),
    }


# ---------------------------------------------------------------------------
# SQLAlchemy session events: flush 시점에 후보를 모으고 commit 시점에 파일로 떨군다.
# ---------------------------------------------------------------------------

_pending_log_ids: dict[int, list] = {}


def _collect_after_flush(session: Session, _flush_context) -> None:
    new_logs = [obj for obj in session.new if isinstance(obj, TransactionLog)]
    if not new_logs:
        return
    bucket = _pending_log_ids.setdefault(id(session), [])
    for log in new_logs:
        if log.transaction_type in AUDIT_TX_TYPES and log.log_id is not None:
            bucket.append(log.log_id)


def _emit_after_commit(session: Session) -> None:
    log_ids = _pending_log_ids.pop(id(session), None)
    if not log_ids:
        return
    # 원본 세션과 같은 엔진으로 새 세션 열어서 재조회 — prod/test 둘 다 동작.
    bind = session.get_bind()
    from sqlalchemy.orm import Session as _Session
    db = _Session(bind=bind)
    try:
        logs = (
            db.query(TransactionLog)
            .filter(TransactionLog.log_id.in_(log_ids))
            .all()
        )
        if not logs:
            return
        item_ids = {log.item_id for log in logs}
        items = db.query(Item).filter(Item.item_id.in_(item_ids)).all()
        items_by_id = {it.item_id: it for it in items}
        emp_ids = {log.producer_employee_id for log in logs if log.producer_employee_id is not None}
        emp_code_by_id = {}
        if emp_ids:
            emps = db.query(Employee).filter(Employee.employee_id.in_(emp_ids)).all()
            emp_code_by_id = {e.employee_id: e.employee_code for e in emps}
        _append_logs(logs, items_by_id, emp_code_by_id)
    except Exception:
        _log.exception("audit_csv after_commit 처리 실패 log_ids=%s", log_ids)
    finally:
        db.close()


def _discard_on_rollback(session: Session) -> None:
    _pending_log_ids.pop(id(session), None)


_listeners_registered: set[int] = set()


def register_session_listeners(sessionmaker=None) -> None:
    """app 시작 시 1회 호출. 주어진 sessionmaker(미지정 시 prod SessionLocal)에
    commit/rollback 후크를 단다. 같은 sessionmaker 에 중복 등록 방지.
    """
    target = sessionmaker if sessionmaker is not None else SessionLocal
    key = id(target)
    if key in _listeners_registered:
        return
    event.listen(target, "after_flush", _collect_after_flush)
    event.listen(target, "after_commit", _emit_after_commit)
    event.listen(target, "after_rollback", _discard_on_rollback)
    _listeners_registered.add(key)
