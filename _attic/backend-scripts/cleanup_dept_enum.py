"""부서 컬럼의 enum repr 더티값 정리.

증상: 일부 레코드의 department 류 컬럼에 'DepartmentEnum.ASSEMBLY' 같은
파이썬 enum repr 이 저장됨(불량 분해·격리 처리 시 str(enum) 으로 박힌 흔적).
이를 정상 한국어 값("조립")으로 교정한다. 원인 코드는 별도 수정됨
(dept_adjustment.py / defects.py 에서 .value 사용).

대상 컬럼:
  - TransactionLog.department          (주범 — 내역 부서 facet 노출)
  - StockRequest.requester_department
  - StockRequestLine.from_department, to_department
  - InventoryLocation.department

실행:
  cd backend
  python ../_attic/backend-scripts/backup_db.py --label cleanup-dept-enum   # 먼저 백업
  python ../_attic/backend-scripts/cleanup_dept_enum.py            # dry-run(변경 없음)
  python ../_attic/backend-scripts/cleanup_dept_enum.py --apply    # 실제 적용

주의: 직원 서버(C:\\ERP-dev) DB 에도 배포 시 동일 실행 필요.
"""
import sys
sys.path.insert(0, ".")

from sqlalchemy import func
from app.database import SessionLocal
from app.models import (
    TransactionLog,
    StockRequest,
    StockRequestLine,
    InventoryLocation,
)

# DepartmentEnum 멤버명 → 한국어 값 (backend/app/models/base.py 와 일치)
DEPT_MAP = {
    "ASSEMBLY": "조립",
    "HIGH_VOLTAGE": "고압",
    "VACUUM": "진공",
    "TUNING": "튜닝",
    "TUBE": "튜브",
    "AS": "AS",
    "RESEARCH": "연구",
    "SALES": "영업",
    "SHIPPING": "출하",
    "ETC": "기타",
    "WAREHOUSE": "창고",
}
PREFIX = "DepartmentEnum."

# (Model, 컬럼명) — 부서를 저장하는 String 컬럼 전수
TARGETS = [
    (TransactionLog, "department"),
    (StockRequest, "requester_department"),
    (StockRequestLine, "from_department"),
    (StockRequestLine, "to_department"),
    (InventoryLocation, "department"),
]


def clean_value(dirty: str) -> str:
    """'DepartmentEnum.ASSEMBLY' → '조립'. 미매핑 멤버는 원본 유지(안전)."""
    member = dirty[len(PREFIX):]
    return DEPT_MAP.get(member, dirty)


def main() -> None:
    apply_mode = "--apply" in sys.argv
    print(f"{'[APPLY]' if apply_mode else '[DRY-RUN]'} 부서 enum repr 더티값 정리\n")

    db = SessionLocal()
    total_rows = 0
    unmapped = 0
    try:
        for model, col in TARGETS:
            column = getattr(model, col)
            rows = (
                db.query(column, func.count())
                .filter(column.like(PREFIX + "%"))
                .group_by(column)
                .all()
            )
            if not rows:
                continue
            print(f"■ {model.__name__}.{col}")
            for dirty, cnt in rows:
                new = clean_value(dirty)
                mapped = new != dirty
                total_rows += cnt
                if not mapped:
                    unmapped += 1
                    print(f"   {dirty}  →  (미매핑, 변경 안 함)   ({cnt}행) ⚠")
                    continue
                print(f"   {dirty}  →  {new}   ({cnt}행)")
                if apply_mode:
                    db.query(model).filter(column == dirty).update(
                        {col: new}, synchronize_session=False
                    )
            print()

        if apply_mode:
            db.commit()
            print(f"완료: 총 {total_rows}행 검출, 미매핑 {unmapped}종 제외 후 교정·커밋됨.")
        else:
            print(
                f"[DRY-RUN] --apply 없이는 변경 없음. "
                f"총 {total_rows}행 검출(미매핑 {unmapped}종 제외 후 교정 예정)."
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
