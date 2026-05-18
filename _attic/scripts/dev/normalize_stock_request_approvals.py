"""1회 보정 — '창고+부서 동시 결재 대기' 데이터를 새 정책에 맞게 정리.

새 정책: 모든 요청은 창고 또는 부서 중 하나로만 결재. 동시 결재는 금지.

대상:
- requires_warehouse_approval=True AND requires_department_approval=True 인
  RESERVED/SUBMITTED 상태 요청.
- request_type 이 MANUAL_ADJUSTMENT 가 아니면(=창고 승인 정상 케이스) →
  requires_department_approval=False, department_approved_* 정리.

dry-run 기본, --apply 로 실제 변경.

사용자 확인: 창고 승인까지 끝나고 부서만 대기인 케이스는 발생 가능성 0.
스크립트는 그런 케이스 발견 시 경고만 출력하고 건드리지 않음 (수동 처리 안내).

사용:
    python scripts/dev/normalize_stock_request_approvals.py            # dry-run
    python scripts/dev/normalize_stock_request_approvals.py --apply    # 실제 변경
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    StockRequest,
    StockRequestStatusEnum,
    StockRequestTypeEnum,
)


def find_dual_pending(db):
    return (
        db.query(StockRequest)
        .filter(
            StockRequest.requires_warehouse_approval.is_(True),
            StockRequest.requires_department_approval.is_(True),
            StockRequest.status.in_(
                (
                    StockRequestStatusEnum.RESERVED,
                    StockRequestStatusEnum.SUBMITTED,
                )
            ),
        )
        .all()
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="실제 DB 변경 수행 (기본은 dry-run).",
    )
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = find_dual_pending(db)
        print(f"동시 결재 대기 요청 발견: {len(rows)}건")
        normalized = 0
        skipped_wh_done = 0
        skipped_manual = 0
        for r in rows:
            warehouse_done = r.approved_by_employee_id is not None
            dept_done = r.department_approved_by_employee_id is not None
            label = r.request_code or str(r.request_id)
            print(
                f"  - {label} type={r.request_type.value if hasattr(r.request_type, 'value') else r.request_type} "
                f"wh_done={warehouse_done} dept_done={dept_done}"
            )
            if warehouse_done and not dept_done:
                print("    [SKIP] 창고 승인 완료/부서 대기 - 수동 처리 권장.")
                skipped_wh_done += 1
                continue
            if r.request_type == StockRequestTypeEnum.MANUAL_ADJUSTMENT:
                print(
                    "    [SKIP] MANUAL_ADJUSTMENT 인데 wh 결재가 켜져 있음 - 수동 확인 필요."
                )
                skipped_manual += 1
                continue
            # 정상 케이스: 창고 승인 sub_type. dept 결재 끄기.
            if args.apply:
                r.requires_department_approval = False
                r.department_approved_by_employee_id = None
                r.department_approved_by_name = None
                r.department_approved_at = None
                print("    → dept 결재 끄기 (apply)")
            else:
                print("    → dept 결재 끄기 (dry-run)")
            normalized += 1

        if args.apply:
            db.commit()
            print(f"\n커밋 완료 — 보정 {normalized}건.")
        else:
            print(
                f"\ndry-run 결과: 보정 대상 {normalized}건, "
                f"스킵(창고 완료 후 부서 대기) {skipped_wh_done}건, "
                f"스킵(manual_adjustment 이상) {skipped_manual}건. "
                "실제 적용은 --apply 옵션 추가."
            )
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
