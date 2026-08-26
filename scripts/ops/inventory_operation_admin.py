#!/usr/bin/env python3
"""Diagnose, repair, and activate the DEXCOWIN MES cancellation ledger.

All mutating commands default to dry-run. Applying one repair or activation
requires an approver and a verified SQLite backup (created automatically when
one is not supplied).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Sequence

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

from app.services.inventory_integrity import diagnose_inventory_integrity  # noqa: E402
from app.services.inventory_integrity_repair import (  # noqa: E402
    InventoryIntegrityRepairError,
    repair_inventory_integrity_issue,
)
from app.services.inventory_operation_activation import (  # noqa: E402
    InventoryOperationActivationError,
    activate_inventory_operation_contract,
)


load_dotenv(BACKEND_DIR / ".env")
VERIFY_BACKUP = PROJECT_ROOT / "scripts" / "ops" / "_verify_backup.py"
BACKUP_TOOL = PROJECT_ROOT / "scripts" / "ops" / "backup_db.py"


class CliSafetyError(RuntimeError):
    """Apply preconditions are missing or unsafe."""


def _add_database_argument(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--db-url", default=None, help="SQLAlchemy database URL")


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="DEXCOWIN MES 취소 원장 정합성 운영 도구",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    diagnose = subparsers.add_parser("diagnose", help="읽기 전용 정합성 진단")
    _add_database_argument(diagnose)
    diagnose.add_argument("--json", action="store_true", help="구조화된 JSON 출력")

    repair = subparsers.add_parser("repair", help="문제 ID 한 건 복구")
    _add_database_argument(repair)
    repair.add_argument("--problem-id", required=True)
    repair.add_argument("--approved-by", required=True)
    repair.add_argument("--apply", action="store_true", help="실제 반영. 기본은 dry-run")
    repair.add_argument("--validated-backup", type=Path, default=None)

    activate = subparsers.add_parser("activate", help="신규 원장과 주간 기준 활성화")
    _add_database_argument(activate)
    activate.add_argument("--approved-by", required=True)
    activate.add_argument("--apply", action="store_true", help="실제 반영. 기본은 dry-run")
    activate.add_argument("--validated-backup", type=Path, default=None)
    activate.add_argument(
        "--weekly-start",
        default=None,
        help="새 주간 기준 시작 ISO 시각. 생략하면 다음 KST 월요일 00:00",
    )
    return parser.parse_args(argv)


def _database_url(value: str | None) -> str:
    return value or os.getenv("DATABASE_URL") or f"sqlite:///{(BACKEND_DIR / 'mes.db').as_posix()}"


def _sqlite_path(database_url: str) -> Path | None:
    if not database_url.startswith("sqlite:///"):
        return None
    return Path(database_url.removeprefix("sqlite:///")).resolve()


def _verify_backup(path: Path) -> None:
    result = subprocess.run(
        [sys.executable, str(VERIFY_BACKUP), str(path)],
        cwd=PROJECT_ROOT,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise CliSafetyError("검증된 백업이 아니므로 적용할 수 없습니다.")


def _create_backup(database_path: Path, label: str) -> Path:
    result = subprocess.run(
        [
            sys.executable,
            str(BACKUP_TOOL),
            "--sqlite",
            str(database_path),
            "--label",
            label,
        ],
        cwd=PROJECT_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, file=sys.stderr, end="")
    if result.returncode != 0:
        raise CliSafetyError("적용 전 DB 백업에 실패했습니다.")
    match = re.search(r"(?m)^BACKUP_PATH=(?P<path>.+?)\s*$", result.stdout)
    if match is None:
        raise CliSafetyError("백업 도구가 검증된 백업 경로를 반환하지 않았습니다.")
    backup = Path(match.group("path").strip()).resolve()
    if not backup.is_file():
        raise CliSafetyError("백업 파일을 확인할 수 없습니다.")
    return backup


def ensure_apply_backup(
    *,
    database_url: str,
    validated_backup: Path | None,
    label: str,
    verify: bool = True,
) -> Path:
    """Apply 전에 기존 검증 백업을 확인하거나 SQLite 백업을 새로 만든다."""
    if validated_backup is not None:
        backup = validated_backup.resolve()
        if not backup.is_file():
            raise CliSafetyError("지정한 검증 백업 파일을 찾을 수 없습니다.")
        if verify:
            _verify_backup(backup)
        return backup

    database_path = _sqlite_path(database_url)
    if database_path is None:
        raise CliSafetyError("비 SQLite DB는 외부 검증 백업 경로가 필요합니다.")
    if not database_path.is_file():
        raise CliSafetyError("적용 대상 SQLite DB를 찾을 수 없습니다.")
    return _create_backup(database_path, label)


def _session_factory(database_url: str):
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False} if database_url.startswith("sqlite") else {},
    )
    return sessionmaker(bind=engine, autoflush=False, autocommit=False)


def _print_diagnostic(db: Session, *, as_json: bool) -> bool:
    result = diagnose_inventory_integrity(db)
    if as_json:
        print(result.model_dump_json(indent=2))
    else:
        state = "PASS" if result.is_consistent else "FAIL"
        print(f"[{state}] inventory operation integrity: {result.issue_count} issue(s)")
        for issue in result.issues:
            print(f"  {issue.problem_id} {issue.category}: {issue.title}")
            print(f"    current : {issue.current_value}")
            print(f"    expected: {issue.expected_value}")
            print(f"    repair  : {'CLI' if issue.repairable else 'manual review'}")
    return result.is_consistent


def _parse_weekly_start(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise CliSafetyError("--weekly-start는 ISO 시각이어야 합니다.") from exc
    if parsed.tzinfo is None:
        raise CliSafetyError("--weekly-start에는 시간대가 포함되어야 합니다.")
    return parsed


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    database_url = _database_url(args.db_url)
    try:
        if args.command in {"repair", "activate"} and args.apply:
            label = (
                "inventory-integrity-repair"
                if args.command == "repair"
                else "inventory-operation-activation"
            )
            backup = ensure_apply_backup(
                database_url=database_url,
                validated_backup=args.validated_backup,
                label=label,
            )
            print(f"[BACKUP] validated: {backup}")

        SessionLocal = _session_factory(database_url)
        with SessionLocal() as db:
            if args.command == "diagnose":
                return 0 if _print_diagnostic(db, as_json=args.json) else 1

            if args.command == "repair":
                if args.apply:
                    with db.begin():
                        report = repair_inventory_integrity_issue(
                            db,
                            problem_id=args.problem_id,
                            approved_by=args.approved_by,
                            apply=True,
                        )
                else:
                    report = repair_inventory_integrity_issue(
                        db,
                        problem_id=args.problem_id,
                        approved_by=args.approved_by,
                        apply=False,
                    )
                mode = "APPLY" if report.applied else "DRY-RUN"
                print(f"[{mode}] {report.problem_id} {report.category}")
                print(f"  before: {report.before_value}")
                print(f"  after : {report.after_value}")
                return 0

            weekly_start = _parse_weekly_start(args.weekly_start)
            if args.apply:
                with db.begin():
                    report = activate_inventory_operation_contract(
                        db,
                        approved_by=args.approved_by,
                        weekly_starts_at=weekly_start,
                        apply=True,
                    )
            else:
                report = activate_inventory_operation_contract(
                    db,
                    approved_by=args.approved_by,
                    weekly_starts_at=weekly_start,
                    apply=False,
                )
            mode = "APPLY" if report.applied else "DRY-RUN"
            print(f"[{mode}] inventory operation contract")
            print(f"  ledger starts: {report.ledger_starts_at.isoformat()}")
            print(f"  weekly starts: {report.weekly_starts_at.isoformat()}")
            return 0
    except (
        CliSafetyError,
        InventoryIntegrityRepairError,
        InventoryOperationActivationError,
    ) as exc:
        print(f"[REJECTED] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
