"""관리자용 F704-02 연간 자재 입출고관리대장 다운로드 API."""

from __future__ import annotations

from io import BytesIO
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.services import f704_02_ledger


router = APIRouter()

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _content_disposition(year: int) -> str:
    """한글 파일명을 지원하는 RFC 5987 Content-Disposition 헤더를 만든다."""
    filename = f"F704-02 (R01) {year}년 자재 입출고관리대장.xlsx"
    fallback = f"F704-02-R01-{year}.xlsx"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"


@router.get(
    "/audit-ledger/f704-02.xlsx",
    dependencies=[Depends(require_admin_pin)],
    response_class=StreamingResponse,
    responses={200: {"content": {_XLSX_MEDIA_TYPE: {}}}},
)
def download_f704_02(
    year: Annotated[int, Query(ge=2000, le=2100)],
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """선택한 KST 연도의 실제 창고 입출고를 F704-02 원본 양식으로 내보낸다."""
    entries = f704_02_ledger.collect_entries(db, year)
    content = f704_02_ledger.render_workbook(entries)
    return StreamingResponse(
        BytesIO(content),
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": _content_disposition(year)},
    )
