---
type: file-explanation
source_path: "backend/app/routers/admin_audit_csv.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# admin_audit_csv.py — admin_audit_csv.py 설명

## 이 파일은 무엇을 책임지나

`admin_audit_csv.py`는 `admin_audit_csv` 업무를 외부 API로 열어 주는 Python 코드입니다. 프론트 화면이 백엔드 기능을 호출할 때 이 파일의 URL을 거칩니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `AuditCsvFile`
- `BackfillResult`
- `_validate_month`
- `list_files`
- `download_csv`
- `download_xlsx`
- `trigger_backfill`
- `API GET "/audit-csv/files"`
- `API GET "/audit-csv/{month}.csv"`
- `API GET "/audit-csv/{month}.xlsx"`
- `API POST "/audit-csv/backfill"`

## 연결되는 파일

### 먼저 같이 볼 파일
- [[ERP/backend/app/schemas/📁_schemas]] — 백엔드와 프론트엔드가 주고받는 데이터 모양을 정하는 파일입니다.
- [[ERP/backend/app/models/📁_models]] — 품목, 재고, 직원, 요청, BOM, 거래 로그처럼 회사 데이터의 뼈대를 정의하는 표 패키지입니다.

## 조심할 점

API 응답 형식이나 상태 코드를 바꾸면 프론트 화면과 자동 테스트가 같이 영향을 받습니다.

## 핵심 발췌

```python
"""외부 심사 대응용 입출고 CSV 다운로드 API.

`app.services.audit_csv` 가 자동으로 떨군 월별 CSV 를 관리자가 받아 제출하는 용도.
- 목록 조회 / CSV 원본 / XLSX 변환 / 수동 백필 4종.
- 권한: 화면단에서 관리자 PIN 잠금이 보호 (admin_audit 라우터와 동일 패턴).
"""

from __future__ import annotations

import re
from typing import List, Optional

from fastapi import APIRouter, Depends
from openpyxl import Workbook
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers._errors import ErrorCode, http_error
from app.services import audit_csv as svc
from app.services.export_helpers import csv_streaming_response
from app.utils.excel import apply_header, auto_width, make_xlsx_response


router = APIRouter()


_MONTH_RE = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


def _validate_month(month: str) -> str:
    if not _MONTH_RE.match(month):
        raise http_error(400, ErrorCode.BAD_REQUEST, "month 는 YYYY-MM 형식이어야 합니다.")
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
```
