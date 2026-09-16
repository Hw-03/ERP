"""감사 로그로 확정된 출하 픽업 처리자 귀속만 안전하게 복구한다.

기본 실행은 dry-run이다. ``--apply`` 시에도 재고·상태·시각·감사 로그를
건드리지 않고, SQLite 온라인 백업 뒤 거래 및 업무 원장의 담당자 필드만 갱신한다.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sqlite3
import uuid


ROOT = Path(__file__).resolve().parents[2]
KST = timezone(timedelta(hours=9))
PICKUP_ACTION_KEY = "http.post.shipping.requests.id.pickup-complete"
PICKUP_PHASE = "PICKUP"
PICKUP_WINDOW = timedelta(seconds=60)
DEFAULT_BACKUP_DIR = ROOT / "_attic" / "runtime" / "backups" / "shipping-pickup-actor"


@dataclass(frozen=True)
class RepairCandidate:
    """감사 근거가 하나로 수렴한 단일 출하 픽업 귀속 변경."""

    request_id: str
    employee_id: str
    employee_code: str
    employee_name: str
    audit_ids: tuple[str, ...]
    log_ids: tuple[str, ...]
    operation_ids: tuple[str, ...]


@dataclass(frozen=True)
class SkippedRequest:
    """안전 기준을 충족하지 않아 자동 복구에서 제외된 요청."""

    request_id: str
    reason: str


@dataclass(frozen=True)
class Discovery:
    """범위 내 안전한 복구 후보와 제외 사유."""

    candidates: tuple[RepairCandidate, ...]
    skipped: tuple[SkippedRequest, ...]


def _normalize_request_id(value: str | None) -> str | None:
    """UUID 문자열을 SQLite 저장 형식(32자리 hex)으로 정규화한다."""
    if not value:
        return None
    try:
        return uuid.UUID(value).hex
    except (ValueError, AttributeError):
        return None


def _parse_db_timestamp(value: str) -> datetime:
    """SQLite의 UTC-naive 또는 ISO 시각을 UTC-naive로 비교 가능하게 만든다."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def parse_kst(value: str) -> datetime:
    """KST 입력 시각을 SQLite 비교용 UTC-naive 시각으로 변환한다."""
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=KST)
    return parsed.astimezone(timezone.utc).replace(tzinfo=None)


def _query_pickup_logs(conn: sqlite3.Connection, request_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT log_id, operation_id, created_at, produced_by, producer_employee_id
        FROM transaction_logs
        WHERE shipping_request_id = ?
          AND shipping_phase = ?
          AND cancelled = 0
        ORDER BY created_at, log_id
        """,
        (request_id, PICKUP_PHASE),
    ).fetchall()


def _load_pickup_operations(
    conn: sqlite3.Connection,
    operation_ids: tuple[str, ...],
) -> list[sqlite3.Row]:
    marks = ", ".join("?" for _ in operation_ids)
    return conn.execute(
        f"""
        SELECT operation_id, domain, action, actor_name, actor_employee_id
        FROM inventory_operations
        WHERE operation_id IN ({marks})
        """,
        operation_ids,
    ).fetchall()


def discover_candidates(
    conn: sqlite3.Connection,
    *,
    from_utc: datetime,
    to_utc: datetime,
    request_ids: set[str] | None = None,
) -> Discovery:
    """성공 감사·활성 PICKUP 로그·업무 원장이 모두 일치한 후보만 찾는다."""
    audits = conn.execute(
        """
        SELECT audit_id, occurred_at, actor_employee_code, related_id
        FROM activity_audit_logs
        WHERE action_key = ?
          AND outcome = 'success'
          AND occurred_at >= ?
          AND occurred_at < ?
          AND related_id IS NOT NULL
        ORDER BY occurred_at, audit_id
        """,
        (PICKUP_ACTION_KEY, from_utc.isoformat(sep=" "), to_utc.isoformat(sep=" ")),
    ).fetchall()
    audits_by_request: dict[str, list[sqlite3.Row]] = defaultdict(list)
    skipped: list[SkippedRequest] = []
    for audit in audits:
        request_id = _normalize_request_id(audit["related_id"])
        if request_id is None:
            skipped.append(SkippedRequest(audit["related_id"], "감사 로그의 요청 ID 형식이 올바르지 않습니다."))
            continue
        if request_ids is None or request_id in request_ids:
            audits_by_request[request_id].append(audit)

    if request_ids is not None:
        for request_id in sorted(request_ids - set(audits_by_request)):
            skipped.append(SkippedRequest(request_id, "범위 내 성공 픽업 감사 로그가 없습니다."))

    candidates: list[RepairCandidate] = []
    for request_id, request_audits in sorted(audits_by_request.items()):
        request = conn.execute(
            "SELECT status FROM shipping_requests WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if request is None or request["status"] != "PICKED_UP":
            skipped.append(SkippedRequest(request_id, "현재 픽업 완료 상태의 출하 요청이 아닙니다."))
            continue

        logs = _query_pickup_logs(conn, request_id)
        if not logs:
            skipped.append(SkippedRequest(request_id, "활성 PICKUP 거래 로그가 없습니다."))
            continue
        try:
            log_times = [_parse_db_timestamp(log["created_at"]) for log in logs]
            matching_audits = [
                audit
                for audit in request_audits
                if all(
                    abs(_parse_db_timestamp(audit["occurred_at"]) - log_time) <= PICKUP_WINDOW
                    for log_time in log_times
                )
            ]
        except (TypeError, ValueError):
            skipped.append(SkippedRequest(request_id, "감사 또는 거래 로그 시각 형식이 올바르지 않습니다."))
            continue
        actor_codes = {audit["actor_employee_code"] for audit in matching_audits if audit["actor_employee_code"]}
        if len(actor_codes) != 1:
            skipped.append(SkippedRequest(request_id, "같은 픽업 시각의 실제 작업자를 하나로 확정할 수 없습니다."))
            continue
        employee_code = actor_codes.pop()
        employee_rows = conn.execute(
            "SELECT employee_id, employee_code, name FROM employees WHERE employee_code = ?",
            (employee_code,),
        ).fetchall()
        if len(employee_rows) != 1:
            skipped.append(SkippedRequest(request_id, "감사 작업자 사번이 직원 데이터와 하나로 연결되지 않습니다."))
            continue
        employee = employee_rows[0]

        operation_ids = tuple(sorted({log["operation_id"] for log in logs if log["operation_id"]}))
        if len(operation_ids) != len({log["operation_id"] for log in logs}):
            skipped.append(SkippedRequest(request_id, "PICKUP 거래 로그에 연결된 업무 원장이 없습니다."))
            continue
        operations = _load_pickup_operations(conn, operation_ids)
        if (
            len(operations) != len(operation_ids)
            or any(row["domain"] != "shipping" or row["action"] != "pickup" for row in operations)
        ):
            skipped.append(SkippedRequest(request_id, "PICKUP 거래 로그와 출하 업무 원장 연결이 일치하지 않습니다."))
            continue

        already_correct = all(
            log["produced_by"] == employee["name"]
            and log["producer_employee_id"] == employee["employee_id"]
            for log in logs
        ) and all(
            operation["actor_name"] == employee["name"]
            and operation["actor_employee_id"] == employee["employee_id"]
            for operation in operations
        )
        if already_correct:
            skipped.append(SkippedRequest(request_id, "거래 및 업무 원장이 이미 감사 작업자로 귀속돼 있습니다."))
            continue

        candidates.append(
            RepairCandidate(
                request_id=request_id,
                employee_id=employee["employee_id"],
                employee_code=employee["employee_code"],
                employee_name=employee["name"],
                audit_ids=tuple(audit["audit_id"] for audit in matching_audits),
                log_ids=tuple(log["log_id"] for log in logs),
                operation_ids=operation_ids,
            )
        )
    return Discovery(tuple(candidates), tuple(skipped))


def backup_database(database: Path, backup_dir: Path) -> Path:
    """SQLite 온라인 백업으로 적용 직전의 복구 지점을 만든다."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_path = backup_dir / f"before-pickup-actor-repair-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}.db"
    with sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True) as source:
        with sqlite3.connect(backup_path) as destination:
            source.backup(destination)
    return backup_path


def _update_candidate(conn: sqlite3.Connection, candidate: RepairCandidate) -> None:
    """검증된 한 후보의 담당자 귀속 필드만 갱신하고 행 수를 확인한다."""
    log_marks = ", ".join("?" for _ in candidate.log_ids)
    updated_logs = conn.execute(
        f"""
        UPDATE transaction_logs
        SET produced_by = ?, producer_employee_id = ?
        WHERE log_id IN ({log_marks})
          AND shipping_phase = ?
          AND cancelled = 0
        """,
        (candidate.employee_name, candidate.employee_id, *candidate.log_ids, PICKUP_PHASE),
    ).rowcount
    if updated_logs != len(candidate.log_ids):
        raise RuntimeError(f"{candidate.request_id}: PICKUP 거래 로그 갱신 행 수가 달라졌습니다.")

    operation_marks = ", ".join("?" for _ in candidate.operation_ids)
    updated_operations = conn.execute(
        f"""
        UPDATE inventory_operations
        SET actor_name = ?, actor_employee_id = ?
        WHERE operation_id IN ({operation_marks})
          AND domain = 'shipping'
          AND action = 'pickup'
        """,
        (candidate.employee_name, candidate.employee_id, *candidate.operation_ids),
    ).rowcount
    if updated_operations != len(candidate.operation_ids):
        raise RuntimeError(f"{candidate.request_id}: PICKUP 업무 원장 갱신 행 수가 달라졌습니다.")


def repair_database(
    database: Path,
    *,
    from_utc: datetime,
    to_utc: datetime,
    apply: bool = False,
    backup_dir: Path = DEFAULT_BACKUP_DIR,
    request_ids: set[str] | None = None,
) -> dict:
    """dry-run 또는 원자적 적용 결과를 JSON 가능 딕셔너리로 반환한다."""
    database = database.resolve()
    if not database.is_file():
        raise ValueError(f"SQLite DB를 찾을 수 없습니다: {database}")
    if from_utc >= to_utc:
        raise ValueError("시작 시각은 종료 시각보다 앞서야 합니다.")
    with sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True) as conn:
        conn.row_factory = sqlite3.Row
        discovery = discover_candidates(
            conn,
            from_utc=from_utc,
            to_utc=to_utc,
            request_ids=request_ids,
        )
    report = {
        "mode": "dry-run",
        "database": str(database),
        "from_utc": from_utc.isoformat(sep=" "),
        "to_utc": to_utc.isoformat(sep=" "),
        "candidates": [asdict(candidate) for candidate in discovery.candidates],
        "skipped": [asdict(skipped) for skipped in discovery.skipped],
        "backup_path": None,
    }
    if not apply or not discovery.candidates:
        return report

    backup_path = backup_database(database, backup_dir)
    with sqlite3.connect(database) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("BEGIN IMMEDIATE")
        locked_discovery = discover_candidates(
            conn,
            from_utc=from_utc,
            to_utc=to_utc,
            request_ids=request_ids,
        )
        if locked_discovery.candidates != discovery.candidates:
            raise RuntimeError("백업 이후 복구 후보가 달라져 적용을 중단했습니다. dry-run부터 다시 실행하세요.")
        for candidate in locked_discovery.candidates:
            _update_candidate(conn, candidate)
        conn.commit()
    report["mode"] = "applied"
    report["backup_path"] = str(backup_path)
    return report


def main() -> None:
    """명시한 KST 범위에서만 안전한 담당자 귀속 복구를 실행한다."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path, help="대상 SQLite DB 경로")
    parser.add_argument("--from-kst", required=True, help="포함 시작 KST ISO 시각")
    parser.add_argument("--to-kst", required=True, help="제외 종료 KST ISO 시각")
    parser.add_argument("--request-id", action="append", help="검토할 출하 요청 UUID (반복 가능)")
    parser.add_argument("--apply", action="store_true", help="검증된 후보를 실제 반영")
    parser.add_argument("--backup-dir", type=Path, default=DEFAULT_BACKUP_DIR)
    args = parser.parse_args()
    requested = {_normalize_request_id(value) for value in args.request_id or []}
    if None in requested:
        raise ValueError("--request-id는 UUID여야 합니다.")
    report = repair_database(
        args.database,
        from_utc=parse_kst(args.from_kst),
        to_utc=parse_kst(args.to_kst),
        apply=args.apply,
        backup_dir=args.backup_dir,
        request_ids=requested or None,
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
