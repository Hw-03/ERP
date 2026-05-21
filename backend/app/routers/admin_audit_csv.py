"""외부 심사 대응용 입출고 CSV 다운로드 API.

`app.services.audit_csv` 가 자동으로 떨군 월별 CSV 를 관리자가 받아 제출하는 용도.
- 목록 조회 / CSV 원본 / XLSX 변환 / 수동 백필 4종.
- 권한: 화면단에서 관리자 PIN 잠금이 보호 (admin_audit 라우터와 동일 패턴).
"""

from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.services import audit_csv as svc
from app.services.export_helpers import csv_streaming_response
from app.utils.excel import apply_header, auto_width, make_xlsx_response


router = APIRouter()


_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_month(month: str) -> str:
    if not _MONTH_RE.match(month):
        raise HTTPException(status_code=400, detail="month 는 YYYY-MM 형식이어야 합니다.")
    return month


class AuditCsvFile(BaseModel):
    month: str
    file_name: str
    size_bytes: int
    row_count: int


class BackfillResult(BaseModel):
    total_rows: int
    months: List[str]


@router.get("/audit-csv/files", response_model=List[AuditCsvFile])
def list_files() -> List[AuditCsvFile]:
    return [AuditCsvFile(**item) for item in svc.list_available_months()]


@router.get("/audit-csv/{month}.csv")
def download_csv(month: str):
    _validate_month(month)
    path = svc.get_csv_dir() / f"inout_{month}.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail="해당 월 CSV 파일이 존재하지 않습니다.")
    from io import StringIO
    buf = StringIO()
    with path.open("r", encoding="utf-8-sig") as f:
        buf.write(f.read())
    return csv_streaming_response(buf, f"inout_{month}.csv")


@router.get("/audit-csv/{month}.xlsx")
def download_xlsx(month: str):
    _validate_month(month)
    path = svc.get_csv_dir() / f"inout_{month}.csv"
    if not path.exists():
        raise HTTPException(status_code=404, detail="해당 월 CSV 파일이 존재하지 않습니다.")

    wb = Workbook()
    ws = wb.active
    ws.title = f"입출고 {month}"

    import csv as _csv
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        reader = _csv.reader(f)
        rows = list(reader)

    if not rows:
        apply_header(ws, svc.CSV_HEADERS)
    else:
        headers, *data = rows
        # 파일이 비어있어도 헤더는 일관 유지
        apply_header(ws, headers if headers else svc.CSV_HEADERS)
        for row in data:
            ws.append(row)
    auto_width(ws)

    return make_xlsx_response(wb, f"inout_{month}.xlsx")


@router.post("/audit-csv/backfill", response_model=BackfillResult)
def trigger_backfill(
    overwrite: bool = True,
    db: Session = Depends(get_db),
) -> BackfillResult:
    """수동 백필 — DB 기준으로 월별 CSV 전체 재작성."""
    result = svc.backfill_all(db, overwrite=overwrite)
    return BackfillResult(**result)
