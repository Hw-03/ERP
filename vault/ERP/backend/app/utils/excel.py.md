---
type: file-explanation
source_path: "backend/app/utils/excel.py"
importance: important
layer: backend
graph: file
updated: 2026-05-22
project: DEXCOWIN MES
---

# excel.py — excel.py 설명

## 이 파일은 무엇을 책임지나

`excel.py`는 Python 코드입니다. 프로젝트 구조 안에서 `backend/app/utils/excel.py` 위치에 있으며, 필요할 때 역할과 연결 파일을 확인하기 위한 설명을 둡니다.

## 업무 흐름에서의 의미

현장 화면에서 발생한 요청이 실제 데이터 조회나 변경으로 이어질 때 이 백엔드 영역이 관여합니다.

## 언제 보면 좋나

- 이 파일이 맡은 화면/API/데이터 흐름을 확인해야 할 때
- 수정 전에 영향 범위를 빠르게 파악해야 할 때

## 중요한 내용

이 파일에서 눈에 띄는 구조는 다음과 같습니다.

- `apply_header`
- `auto_width`
- `make_xlsx_response`

## 연결되는 파일

- [[ERP/backend/app/utils/📁_utils]] — 이 파일이 속한 폴더의 안내판입니다.

## 조심할 점

큰 위험은 낮지만, 연결된 파일과 실행 위치를 확인한 뒤 수정하는 편이 안전합니다.

## 핵심 발췌

```python
"""Excel export helpers using openpyxl."""

from io import BytesIO

from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

HEADER_FILL = PatternFill("solid", fgColor="1A3A5C")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)


def apply_header(ws, columns: list[str]) -> None:
    ws.append(columns)
    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center")
    ws.row_dimensions[1].height = 20
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions


def auto_width(ws) -> None:
    for col in ws.columns:
        max_len = max((len(str(c.value or "")) for c in col), default=8)
        ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)


def make_xlsx_response(wb: Workbook, filename: str) -> StreamingResponse:
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```
