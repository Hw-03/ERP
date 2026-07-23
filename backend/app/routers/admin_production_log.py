"""Administrator download API for the F705-02 annual production log."""

from __future__ import annotations

from io import BytesIO
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies.admin import require_admin_pin
from app.services import f705_02_production_log


router = APIRouter()

_XLSX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _content_disposition(year: int) -> str:
    """Build a Korean filename header with an ASCII fallback."""
    filename = f"F705-02 (R01) {year} 생산일지.xlsx"
    fallback = f"F705-02-R01-{year}.xlsx"
    return f"attachment; filename=\"{fallback}\"; filename*=UTF-8''{quote(filename)}"


@router.get(
    "/production-log/f705-02.xlsx",
    dependencies=[Depends(require_admin_pin)],
    response_class=StreamingResponse,
    responses={200: {"content": {_XLSX_MEDIA_TYPE: {}}}},
)
def download_f705_02(
    year: Annotated[int, Query(ge=2000, le=2099)],
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Generate a full selected-year F705-02 workbook from MES production logs."""
    quantities = f705_02_production_log.collect_daily_quantities(db, year)
    content = f705_02_production_log.render_workbook(year, quantities)
    return StreamingResponse(
        BytesIO(content),
        media_type=_XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": _content_disposition(year)},
    )
